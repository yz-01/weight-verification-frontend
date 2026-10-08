import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearPhotoCaches,
  photoCacheSummary,
  protectedOnPhone,
  type CacheStore,
} from "@/lib/local-cleanup";
import type { LocalOriginalState } from "@/lib/offline-db";
import { ABANDONED_AFTER_MS, nameWithOriginal } from "@/lib/original-photos";

/**
 * 「清理本地记录」 (client 2026-10-09 四.3, 四.6, 五.6, 五.7; decision 4).
 *
 * The cleanup clears the cached photos and nothing else; the protection rule
 * counts what it must never reach: unsent records, drafts, originals not
 * backed up.
 */

const draftId = (user: string, scope: string) => JSON.stringify(["c-1", user, scope]);

const NOW = Date.parse("2026-10-20T00:00:00Z");
const OLD = new Date(NOW - ABANDONED_AFTER_MS - 1000).toISOString();
const RECENT = new Date(NOW - 1000).toISOString();
const original = (
  id: string,
  ownerId: string,
  size: number,
  state: LocalOriginalState,
  capturedAt = RECENT,
) => ({ id, ownerId, size, state, capturedAt });

describe("what no cleanup may remove (protectedOnPhone)", () => {
  it("counts one worker's unsent records, filled drafts and originals not backed up", () => {
    const kept = protectedOnPhone(
      {
        jobs: [
          { id: "job-1", payload: {} },
          { id: "job-2", payload: {} },
        ],
        drafts: [
          { id: draftId("u-1", "receipt"), values: { supplier: "ABC" } },
          // Submitted and cleared: nothing left to protect.
          { id: draftId("u-1", "progress"), values: {} },
          // Somebody else's on the same phone.
          { id: draftId("u-2", "receipt"), values: { supplier: "XYZ" } },
        ],
        draftFileNames: [],
        originals: [
          original("o1", "u-1", 1_500_000, "pending", OLD),
          original("o2", "u-1", 500_000, "captured"),
          original("o3", "u-2", 900_000, "pending"),
        ],
      },
      "u-1",
      NOW,
    );
    expect(kept).toEqual({ unsent: 2, drafts: 1, originals: 2, originalBytes: 2_000_000 });
  });

  it("counts originals exactly as protectedLocalItems keeps them", () => {
    const inQueue = "1".repeat(32);
    const inDraft = "2".repeat(32);
    const abandoned = "3".repeat(32);
    const kept = protectedOnPhone(
      {
        jobs: [{ id: "job-1", payload: { photos: [{ name: nameWithOriginal("a.jpg", inQueue), blob: {} }] } }],
        drafts: [],
        draftFileNames: [nameWithOriginal("b.jpg", inDraft)],
        originals: [
          original(inQueue, "u-1", 100, "captured", OLD),
          original(inDraft, "u-1", 200, "captured", OLD),
          // A week-old shot nothing holds: the originals package may drop it.
          original(abandoned, "u-1", 400, "captured", OLD),
        ],
      },
      "u-1",
      NOW,
    );
    expect(kept).toMatchObject({ unsent: 1, originals: 2, originalBytes: 300 });
  });

  it("counts every original as kept when the drafts' photos could not be read", () => {
    const kept = protectedOnPhone(
      {
        jobs: [],
        drafts: [],
        draftFileNames: null,
        originals: [original("3".repeat(32), "u-1", 400, "captured", OLD)],
      },
      "u-1",
      NOW,
    );
    expect(kept).toMatchObject({ originals: 1, originalBytes: 400 });
  });

  it("counts a draft whose owner cannot be read as kept, not as clearable", () => {
    const kept = protectedOnPhone(
      {
        jobs: [],
        drafts: [{ id: "not-json", values: { note: "x" } }],
        draftFileNames: [],
        originals: [],
      },
      "u-1",
    );
    expect(kept.drafts).toBe(1);
  });
});

/** Cache Storage in memory, entries per cache name. */
function memoryCaches(content: Record<string, Record<string, Response>>) {
  const stores = new Map(Object.entries(content).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const store: CacheStore = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {
        keys: async () => [...entries.keys()].map((url) => new Request(url)),
        match: async (request: RequestInfo | URL) =>
          entries.get(typeof request === "string" ? request : (request as Request).url)?.clone(),
      } as unknown as Cache;
    },
  };
  return { store, stores };
}

const kept = (bytes: number) => new Response("x", { headers: { "x-mse-bytes": String(bytes) } });
const THUMB = "https://bucket.example/evidence/thumbnails/v2/w400";

describe("clearing local records clears cached photos only", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts the kept pictures and their bytes", async () => {
    const { store } = memoryCaches({
      "mse-trace-photos-v1": { [`${THUMB}/a.webp`]: kept(20_000), [`${THUMB}/b.webp`]: kept(18_000) },
      "mse-trace-shell-v14": { "https://mse.example/offline": new Response("<html>") },
    });
    expect(await photoCacheSummary(store)).toEqual({ count: 2, bytes: 38_000 });
  });

  it("deletes the photo caches, keeps the app shell, and never opens IndexedDB or localStorage", async () => {
    // The queue, the drafts and the originals live in IndexedDB and
    // localStorage: any touch of either fails this test.
    const forbidden = () => {
      throw new Error("the cleanup reached the phone's protected stores");
    };
    vi.stubGlobal("indexedDB", new Proxy({}, { get: forbidden }));
    vi.stubGlobal("localStorage", new Proxy({}, { get: forbidden }));
    const { store, stores } = memoryCaches({
      "mse-trace-photos-v1": { [`${THUMB}/a.webp`]: kept(20_000) },
      "mse-trace-photos-full-v1": { "https://bucket.example/evidence/watermarked/a.jpg": kept(300_000) },
      "mse-trace-shell-v14": { "https://mse.example/offline": new Response("<html>") },
    });

    const cleared = await clearPhotoCaches(store);

    expect(cleared).toEqual({ count: 2, bytes: 320_000 });
    expect([...stores.keys()]).toEqual(["mse-trace-shell-v14"]);
  });

  it("is a no-op where the browser has no Cache Storage", async () => {
    expect(await clearPhotoCaches(null)).toEqual({ count: 0, bytes: 0 });
  });
});
