import { afterEach, describe, expect, it, vi } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";

/**
 * 现场实际退场 with no signal (Q29.3, audit #10).
 *
 * At the gate the lorry is loaded, four photos are taken and both sides sign
 * - often where the phone has no network. The exit has to wait on the phone
 * with its photos and both signatures, reach the server once however often
 * the queue retries, and never hold up the jobs behind it when the server
 * refuses it. IndexedDB is a map here and the network a mock, so what runs
 * is the real store-then-replay.
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "o-1" }));

vi.mock("@/lib/offline-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline-db")>()),
  getOfflineJobs: async (ownerId: string) =>
    [...store.values()].filter((job) => job.ownerId === ownerId),
  putOfflineJob: async (job: OfflineJob) => {
    store.set(job.id, structuredClone(job));
  },
  deleteOfflineJob: async (id: string) => {
    store.delete(id);
  },
  countOfflineJobs: async (ownerId: string) =>
    [...store.values()].filter((job) => job.ownerId === ownerId).length,
}));

vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api: { post: (...args: unknown[]) => post(...args) },
  toastSuccess: () => undefined,
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");
const { ApiError } = await import("@/interfaces/api");

const file = (name: string) => new File([name], name, { type: "image/png" });

const draft = () => ({
  outgoing: "o-1",
  reference_no: "MO-SITE-261008-001",
  returned_quantity: "2",
  vehicle_plate: "WXY 1234",
  delivery_note_no: "DO-778",
  supplier: "s-1",
  note: "Loaded at gate 2",
  latitude: "3.1149475",
  longitude: "101.7294695",
  client_event_id: "outgoing-exit-abc",
  photos: [file("a.png"), file("b.png"), file("c.png"), file("d.png")],
  site_signature: file("site.png"),
  supplier_signature: file("driver.png"),
});

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "o-1" }));
});

describe("an exit recorded with no signal", () => {
  it("waits on the phone as its own job, with every photo and both signatures", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const result = await queue.submitMaterialOutgoingExitOfflineAware("ahmad", draft());

    expect(result).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    const [job] = [...store.values()];
    expect(job.kind).toBe("MATERIAL_OUTGOING_EXIT");
    if (job.kind !== "MATERIAL_OUTGOING_EXIT") throw new Error("wrong kind");
    expect(job.payload.photos).toHaveLength(4);
    expect(job.payload.site_signature.blob).toBeInstanceOf(Blob);
    expect(job.payload.supplier_signature.blob).toBeInstanceOf(Blob);
    expect(job.payload.client_event_id).toBe("outgoing-exit-abc");

    // The queue names it by the application's number.
    const [entry] = await queue.getOfflineQueueEntries("ahmad");
    expect(entry.reference).toBe("MO-SITE-261008-001");
    expect(await queue.queuedOutgoingExit("ahmad", "o-1")).toBe(true);
    expect(await queue.queuedOutgoingExit("ahmad", "o-2")).toBe(false);

    vi.stubGlobal("navigator", { onLine: true });
    const flushed = await queue.flushOfflineJobs("ahmad");

    expect(flushed.synced).toBe(1);
    const [url, data] = post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/material-outgoing/o-1/return_processing/");
    expect(data.get("client_event_id")).toBe("outgoing-exit-abc");
    expect(data.get("returned_quantity")).toBe("2");
    expect(data.get("vehicle_plate")).toBe("WXY 1234");
    expect(data.get("delivery_note_no")).toBe("DO-778");
    expect(data.get("supplier")).toBe("s-1");
    expect(data.getAll("photos")).toHaveLength(4);
    expect(data.get("site_signature")).toBeInstanceOf(File);
    expect(data.get("supplier_signature")).toBeInstanceOf(File);
    expect(store.size).toBe(0);
  });

  it("keeps one client event id from the lost answer to the replay", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    // The exit reached the server and its answer was lost on the way back.
    post.mockImplementationOnce(async () => {
      throw new ApiError("offline", 0);
    });

    const result = await queue.submitMaterialOutgoingExitOfflineAware("ahmad", draft());

    expect(result).toBe("queued");
    const first = (post.mock.calls[0] as [string, FormData])[1].get("client_event_id");
    await queue.flushOfflineJobs("ahmad");
    const replay = (post.mock.calls.at(-1) as [string, FormData])[1].get("client_event_id");
    expect(first).toBe("outgoing-exit-abc");
    expect(replay).toBe(first);
  });

  it("a refusal shows 需要处理 with its reason and does not hold up the next job", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitMaterialOutgoingExitOfflineAware("ahmad", draft());
    await queue.submitMaterialOutgoingExitOfflineAware("ahmad", {
      ...draft(),
      outgoing: "o-2",
      reference_no: "MO-SITE-261008-002",
      client_event_id: "outgoing-exit-def",
    });
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementation(async (url: unknown) => {
      if (String(url).includes("/o-1/")) {
        throw new ApiError("The office has already closed this return.", 409, {}, "validation_failed");
      }
      return { id: "o-2" };
    });

    const flushed = await queue.flushOfflineJobs("ahmad");

    expect(flushed.synced).toBe(1);
    const [left] = [...store.values()];
    expect(left.kind).toBe("MATERIAL_OUTGOING_EXIT");
    expect(left.needsAttention).toBe(true);
    expect(left.lastError).toBe("The office has already closed this return.");
    const [entry] = await queue.getOfflineQueueEntries("ahmad");
    expect(entry.state).toBe("failed");
    expect(entry.hint).toBe("offline.conflict.changed");
  });

  it("a dead network is retried by itself", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitMaterialOutgoingExitOfflineAware("ahmad", draft());
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementationOnce(async () => {
      throw new ApiError("offline", 0);
    });

    await queue.flushOfflineJobs("ahmad");
    const [waiting] = [...store.values()];
    expect(waiting.needsAttention).toBe(false);
    expect(waiting.attempts).toBe(1);

    const flushed = await queue.flushOfflineJobs("ahmad");
    expect(flushed.synced).toBe(1);
  });
});
