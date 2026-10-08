import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「同步原图」, the second queue (H5 三.3, 三.4, 五.4, 五.5, WP1).
 *
 * - An original the server already verified is dropped here without being
 *   sent again (五.4: no repeated upload).
 * - One whose record has not reached the server waits; the application
 *   photo goes first (三.3).
 * - A verified upload deletes the phone's copy (五.5); a refusal keeps it,
 *   marked failed, for the worker to send again.
 * - It never runs ahead of a pass of the application photos' queue.
 * - Abandoned shots are pruned only as `protectedLocalItems` allows.
 */

const originals = new Map<string, Record<string, unknown>>();
const jobs: Array<{ id: string; ownerId: string; payload: unknown }> = [];
let draftNames: string[] = [];
const post = vi.fn();
let flush: Promise<unknown> | null = null;

vi.mock("@/lib/offline-db", () => ({
  getLocalOriginal: async (id: string) => originals.get(id) ?? null,
  getLocalOriginals: async (ownerId: string) =>
    [...originals.values()].filter((row) => row.ownerId === ownerId),
  updateLocalOriginal: async (id: string, change: Record<string, unknown>) => {
    const row = originals.get(id);
    if (!row) return null;
    originals.set(id, { ...row, ...change });
    return originals.get(id);
  },
  deleteLocalOriginal: async (id: string) => {
    originals.delete(id);
  },
  getOfflineJobs: async (ownerId: string) => jobs.filter((job) => job.ownerId === ownerId),
}));
vi.mock("@/lib/form-draft-store", () => ({ draftFileNames: async () => draftNames }));
vi.mock("@/services/api-client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));
vi.mock("@/services/offline-sync.service", () => ({ offlineFlushInFlight: () => flush }));

import { ApiError } from "@/interfaces/api";
import { ABANDONED_AFTER_MS, nameWithOriginal } from "@/lib/original-photos";
import { pruneAbandonedOriginals, syncOriginals } from "@/services/original-sync.service";

function keep(id: string, state: string, extra: Record<string, unknown> = {}) {
  originals.set(id, {
    id,
    ownerId: "worker",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    sha256: id.slice(0, 1).repeat(64),
    size: 3,
    photoSha256: "p".repeat(64),
    capturedAt: new Date().toISOString(),
    state,
    attempts: 0,
    ...extra,
  });
}

function statuses(results: Record<string, string>, photos: Record<string, boolean> = {}) {
  return {
    results: Object.fromEntries(Object.entries(results).map(([sha, status]) => [sha, { status }])),
    photos,
  };
}

const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);

beforeEach(() => {
  originals.clear();
  jobs.length = 0;
  draftNames = [];
  post.mockReset();
  flush = null;
});

describe("syncOriginals", () => {
  it("drops one the server verified, waits on one whose record is not there, sends the rest", async () => {
    keep(A, "pending");
    keep(B, "captured");
    keep(C, "pending");
    post.mockImplementation(async (path: string) => {
      if (path.includes("get_original_status")) {
        return statuses({ ["a".repeat(64)]: "ORIGINAL_BACKED_UP", ["c".repeat(64)]: "ORIGINAL_PENDING" });
      }
      return { status: "ORIGINAL_BACKED_UP" };
    });

    const result = await syncOriginals("worker");

    expect(result).toEqual({ backedUp: 2, failed: 0, notYet: 1 });
    const uploads = post.mock.calls.filter(([path]) => String(path).includes("upload_original"));
    expect(uploads).toHaveLength(1);
    const body = uploads[0][1] as FormData;
    expect(body.get("sha256")).toBe("c".repeat(64));
    expect(body.get("photo_sha256")).toBe("p".repeat(64));
    // Verified on the server: the phone's copy goes; the unsent record's stays.
    expect([...originals.keys()]).toEqual([B]);
  });

  it("sends a captured one whose application photo the server already holds", async () => {
    keep(B, "captured");
    post.mockImplementation(async (path: string) =>
      path.includes("get_original_status")
        ? statuses({ ["b".repeat(64)]: "NOT_EXPECTED" }, { ["p".repeat(64)]: true })
        : { status: "ORIGINAL_BACKED_UP" },
    );
    expect(await syncOriginals("worker")).toEqual({ backedUp: 1, failed: 0, notYet: 0 });
    expect(originals.size).toBe(0);
  });

  it("keeps a refused original, marked failed with the server's code", async () => {
    keep(A, "pending");
    post.mockImplementation(async (path: string) => {
      if (path.includes("get_original_status")) return statuses({ ["a".repeat(64)]: "ORIGINAL_PENDING" });
      throw new ApiError("mismatch", 409, {}, "original_hash_mismatch");
    });
    expect(await syncOriginals("worker")).toEqual({ backedUp: 0, failed: 1, notYet: 0 });
    expect(originals.get(A)).toMatchObject({
      state: "failed",
      attempts: 1,
      lastErrorCode: "original_hash_mismatch",
    });
  });

  it("only sends the record's own originals when asked for one record", async () => {
    keep(A, "pending");
    keep(C, "pending");
    post.mockImplementation(async (path: string) =>
      path.includes("get_original_status") ? statuses({}) : { status: "ORIGINAL_BACKED_UP" },
    );
    await syncOriginals("worker", [C]);
    expect([...originals.keys()]).toEqual([A]);
  });

  it("waits for a pass of the application photos before sending", async () => {
    keep(A, "pending");
    const order: string[] = [];
    let release: () => void = () => undefined;
    flush = new Promise<void>((resolve) => {
      release = () => {
        order.push("app queue done");
        resolve();
      };
    });
    post.mockImplementation(async (path: string) => {
      if (path.includes("get_original_status")) return statuses({});
      order.push("original sent");
      return { status: "ORIGINAL_BACKED_UP" };
    });
    const run = syncOriginals("worker");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual([]);
    release();
    await run;
    expect(order).toEqual(["app queue done", "original sent"]);
  });
});

describe("pruneAbandonedOriginals", () => {
  it("drops only week-old shots that no job, draft or record holds", async () => {
    const old = new Date(Date.now() - ABANDONED_AFTER_MS - 60_000).toISOString();
    keep(A, "captured", { capturedAt: old });
    keep(B, "captured", { capturedAt: old });
    keep(C, "pending", { capturedAt: old });
    const D = "d".repeat(32);
    keep(D, "captured", { capturedAt: old });
    jobs.push({ id: "job", ownerId: "worker", payload: { photos: [{ name: nameWithOriginal("x.jpg", B), blob: {} }] } });
    draftNames = [nameWithOriginal("y.jpg", D)];
    post.mockResolvedValueOnce(statuses({}));

    expect(await pruneAbandonedOriginals("worker")).toBe(1);
    expect([...originals.keys()].sort()).toEqual([B, C, D].sort());
    // Only the candidate is asked about.
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toEqual({ sha256: ["a".repeat(64)], photo_sha256: ["p".repeat(64)] });
  });

  it("keeps a captured original the server is waiting for, or whose photo it holds", async () => {
    // The upload landed but its 「待同步」 mark failed to save: still
    // `captured` on the phone, while the server waits for it (三.8).
    const old = new Date(Date.now() - ABANDONED_AFTER_MS - 60_000).toISOString();
    const D = "d".repeat(32);
    const E = "e".repeat(32);
    keep(A, "captured", { capturedAt: old, photoSha256: "1".repeat(64) });
    keep(B, "captured", { capturedAt: old, photoSha256: "2".repeat(64) });
    keep(C, "captured", { capturedAt: old, photoSha256: "3".repeat(64) });
    keep(D, "captured", { capturedAt: old, photoSha256: "4".repeat(64) });
    keep(E, "captured", { capturedAt: old, photoSha256: "5".repeat(64) });
    post.mockResolvedValueOnce(
      statuses(
        {
          ["a".repeat(64)]: "ORIGINAL_PENDING",
          ["b".repeat(64)]: "ORIGINAL_FAILED",
          ["d".repeat(64)]: "ORIGINAL_BACKED_UP",
          ["e".repeat(64)]: "NOT_EXPECTED",
        },
        { ["3".repeat(64)]: true },
      ),
    );

    expect(await pruneAbandonedOriginals("worker")).toBe(2);
    // D: the server holds its verified copy; E: nothing anywhere wants it.
    expect([...originals.keys()].sort()).toEqual([A, B, C].sort());
  });

  it("deletes nothing when the server does not answer, or the phone is offline", async () => {
    const old = new Date(Date.now() - ABANDONED_AFTER_MS - 60_000).toISOString();
    keep(A, "captured", { capturedAt: old });
    post.mockRejectedValueOnce(new ApiError("no answer", 0, {}));
    expect(await pruneAbandonedOriginals("worker")).toBe(0);
    post.mockResolvedValueOnce(undefined);
    expect(await pruneAbandonedOriginals("worker")).toBe(0);
    expect([...originals.keys()]).toEqual([A]);

    vi.stubGlobal("navigator", { onLine: false });
    try {
      expect(await pruneAbandonedOriginals("worker")).toBe(0);
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
    expect([...originals.keys()]).toEqual([A]);
  });
});
