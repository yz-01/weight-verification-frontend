import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearPhotoCaches,
  photoCacheSummary,
  protectedOnPhone,
  type CacheStore,
} from "@/lib/local-cleanup";

/**
 * 「清理本地记录」 (client 2026-10-09 四.3, 四.6, 五.6, 五.7; decision 4).
 *
 * The cleanup clears the cached photos and nothing else; the protection rule
 * counts what it must never reach: unsent records, drafts, originals not
 * backed up.
 */

const draftId = (user: string, scope: string) => JSON.stringify(["c-1", user, scope]);

describe("what no cleanup may remove (protectedOnPhone)", () => {
  it("counts one worker's unsent records, filled drafts and originals not backed up", () => {
    const kept = protectedOnPhone(
      {
        unsentJobs: 2,
        drafts: [
          { id: draftId("u-1", "receipt"), values: { supplier: "ABC" } },
          // Submitted and cleared: nothing left to protect.
          { id: draftId("u-1", "progress"), values: {} },
          // Somebody else's on the same phone.
          { id: draftId("u-2", "receipt"), values: { supplier: "XYZ" } },
        ],
        originals: [
          { id: "o1", ownerId: "u-1", size: 1_500_000 },
          { id: "o2", ownerId: "u-1", size: 500_000 },
          { id: "o3", ownerId: "u-2", size: 900_000 },
        ],
      },
      "u-1",
    );
    expect(kept).toEqual({ unsent: 2, drafts: 1, originals: 2, originalBytes: 2_000_000 });
  });

  it("counts a draft whose owner cannot be read as kept, not as clearable", () => {
    const kept = protectedOnPhone(
      { unsentJobs: 0, drafts: [{ id: "not-json", values: { note: "x" } }], originals: [] },
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
