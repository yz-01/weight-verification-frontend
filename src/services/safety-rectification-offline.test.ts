import { afterEach, describe, expect, it, vi } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";

/**
 * 提交整改 with no signal (I37): the fix's photo and its files wait on the
 * phone as ONE job under ONE `client_event_id`; online, a lost answer and a
 * retry carry the same id, which the server answers with the submission it
 * already has (`site_operations.tests.test_hazard_attachments`).
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "incident" }));

vi.mock("@/lib/offline-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline-db")>()),
  getOfflineJobs: async (ownerId: string) => [...store.values()].filter((job) => job.ownerId === ownerId),
  putOfflineJob: async (job: OfflineJob) => {
    store.set(job.id, structuredClone(job));
  },
  deleteOfflineJob: async (id: string) => {
    store.delete(id);
  },
  countOfflineJobs: async (ownerId: string) => [...store.values()].filter((job) => job.ownerId === ownerId).length,
}));

vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api: { post: (...args: unknown[]) => post(...args) },
  toastSuccess: () => undefined,
  toastOutcome: () => undefined,
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");

const photo = () => new File(["fixed"], "fixed.jpg", { type: "image/jpeg" });
const sheet = () => new File(["pdf"], "proof.pdf", { type: "application/pdf" });
const draft = () => ({
  images: [photo()],
  attachments: [sheet()],
  note: "Done",
  captured_at: "2026-10-16T01:00:00.000Z",
  client_event_id: "rect-1",
});

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "incident" }));
});

describe("a rectification submitted offline", () => {
  it("queues photo and file in one job and sends them together, once", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await queue.submitSafetyRectificationOfflineAware("worker", "inc-1", draft());
    expect(result).toEqual({ status: "queued" });
    expect(post).not.toHaveBeenCalled();
    const [job] = [...store.values()];
    expect(job.kind).toBe("SAFETY_RECTIFICATION");
    if (job.kind !== "SAFETY_RECTIFICATION") throw new Error("wrong kind");
    expect(job.payload.images).toHaveLength(1);
    expect(job.payload.attachments).toHaveLength(1);

    vi.stubGlobal("navigator", { onLine: true });
    const flushed = await queue.flushOfflineJobs("worker");
    expect(flushed.synced).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, data] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/safety-incidents/inc-1/submit_rectification/");
    expect(data.get("client_event_id")).toBe("rect-1");
    expect(data.getAll("images")).toHaveLength(1);
    expect(data.getAll("attachments")).toHaveLength(1);
    expect(store.size).toBe(0);

    await queue.flushOfflineJobs("worker");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("a retry after a lost answer sends the same client_event_id", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const first = await queue.submitSafetyRectificationOfflineAware("worker", "inc-1", draft());
    expect(first).toEqual({ status: "queued" });
    await queue.flushOfflineJobs("worker");
    const ids = post.mock.calls.map((call) => (call[1] as FormData).get("client_event_id"));
    expect(ids).toEqual(["rect-1", "rect-1"]);
  });
});
