import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import type { OfflineJob } from "@/lib/offline-db";

/**
 * 提交整改 with no signal (I37): the fix's photo and its files wait on the
 * phone as ONE job under ONE `client_event_id`; online, a lost answer and a
 * retry carry the same id, which the server answers with the submission it
 * already has (`site_operations.tests.test_hazard_attachments`). Since
 * P-phonefix the fix goes first and each file follows as its own job, under
 * an id derived from the fix's.
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
  it("sends the fix and its photo first, then each file as its own job, once", async () => {
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
    // The file does not ride with the fix: a 20 MB file on a weak signal
    // must not hold the fix back (P-phonefix).
    expect(data.getAll("attachments")).toHaveLength(0);
    const [file] = [...store.values()];
    expect(file.kind).toBe("HAZARD_FILE");

    await queue.flushOfflineJobs("worker");
    expect(post).toHaveBeenCalledTimes(2);
    const [fileUrl, fileData] = post.mock.calls[1] as [string, FormData];
    expect(fileUrl).toBe("/api/safety-incidents/inc-1/post_hazard_message/");
    expect(fileData.get("client_event_id")).toBe("rect-1:rectification-attachment:0");
    expect((fileData.get("attachment") as File).name).toBe("proof.pdf");
    expect(store.size).toBe(0);

    await queue.flushOfflineJobs("worker");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("online, the fix goes at once and its file follows from the queue", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const result = await queue.submitSafetyRectificationOfflineAware("worker", "inc-1", draft());
    expect(result).toEqual({ status: "uploaded" });
    expect(post).toHaveBeenCalledTimes(1);
    expect((post.mock.calls[0][1] as FormData).getAll("attachments")).toHaveLength(0);
    expect([...store.values()].map((job) => job.kind)).toEqual(["HAZARD_FILE"]);
  });

  it("a retry after a lost answer sends the same client_event_id", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockRejectedValueOnce(new ApiError("offline", 0));
    const first = await queue.submitSafetyRectificationOfflineAware("worker", "inc-1", draft());
    expect(first).toEqual({ status: "queued" });
    await queue.flushOfflineJobs("worker");
    const ids = post.mock.calls.map((call) => (call[1] as FormData).get("client_event_id"));
    expect(ids).toEqual(["rect-1", "rect-1"]);
  });
});

describe("a hazard report with files", () => {
  const report = () => ({
    project: "p1",
    title: "",
    description: "Loose scaffold",
    photos: [photo()],
    attachments: [sheet(), new File(["xls"], "list.xlsx")],
    client_event_id: "rep-1",
  });

  it("reaches the office with its photos first; each file follows on its own", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementation(async () => ({ id: "inc-9" }));
    const result = await queue.submitSafetyIncidentOfflineAware("worker", report());
    expect(result.status).toBe("uploaded");
    expect(post).toHaveBeenCalledTimes(1);
    const [url, data] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/safety-incidents/create_safety_incident/");
    expect(data.getAll("photos")).toHaveLength(1);
    expect(data.getAll("attachments")).toHaveLength(0);

    await queue.flushOfflineJobs("worker");
    const files = post.mock.calls.slice(1) as Array<[string, FormData]>;
    expect(files.map(([path]) => path)).toEqual([
      "/api/safety-incidents/inc-9/post_hazard_message/",
      "/api/safety-incidents/inc-9/post_hazard_message/",
    ]);
    expect(files.map(([, body]) => body.get("client_event_id"))).toEqual([
      "rep-1:attachment:0",
      "rep-1:attachment:1",
    ]);
    expect(store.size).toBe(0);
  });

  it("a file that times out stays queued alone; the report is not sent again", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitSafetyIncidentOfflineAware("worker", report());
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementation(async () => ({ id: "inc-9" }));
    await queue.flushOfflineJobs("worker");
    expect(post).toHaveBeenCalledTimes(1);

    post.mockImplementation(async (...args: unknown[]) => {
      if ((args[1] as FormData).get("client_event_id") === "rep-1:attachment:0") {
        throw new ApiError("timeout", 0, {}, "timeout");
      }
      return { id: "msg" };
    });
    await queue.flushOfflineJobs("worker");
    const left = [...store.values()];
    expect(left).toHaveLength(1);
    expect(left[0].kind).toBe("HAZARD_FILE");
    const reports = post.mock.calls.filter(([path]) => String(path).includes("create_safety_incident"));
    expect(reports).toHaveLength(1);
  });
});
