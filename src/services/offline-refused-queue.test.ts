import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import type { OfflineJob } from "@/lib/offline-db";

/**
 * A record the server refused does not sit in 「等待上传」 for good (JB98).
 *
 * 客户 11-05 事项 1: 「图1图2请检查一下有网络了它还是不会提交。早上白天的发送」 - a
 * 门岗 photo kept since the morning was refused with 「Validation failed.」,
 * the phone stopped trying, kept counting it as waiting and had nothing on
 * the phone to retry or delete it with. Now: a refusal is counted apart as
 * 「上传失败」, kept with a reason in the worker's words, said once by the pass,
 * and the worker can retry or delete that one record - any kind of record.
 *
 * IndexedDB is a map here and the network a mock, as in
 * `gate-photo-offline.test.ts`.
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "gate" }));
const refusalToast = vi.fn();

vi.mock("@/lib/offline-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline-db")>()),
  getOfflineJobs: async (ownerId: string) =>
    [...store.values()].filter((job) => job.ownerId === ownerId),
  putOfflineJob: async (job: OfflineJob) => {
    store.set(job.id, job);
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
  toastOutcome: () => undefined,
  toastRefusal: (...args: unknown[]) => refusalToast(...args),
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");

const shot = (bytes = "lorry") => new File([bytes], "lorry.jpg", { type: "image/jpeg" });

async function queueGatePhoto(eventId = "gate-a", photo = shot()) {
  vi.stubGlobal("navigator", { onLine: false });
  await queue.submitGatePhotoOfflineAware("guard", {
    project: "p1",
    is_issue: false,
    members: [],
    client_event_id: `${eventId}-record`,
    photos: [{ file: photo, captured_at: "2026-11-05T00:30:00.000Z", client_event_id: eventId }],
  });
  vi.stubGlobal("navigator", { onLine: true });
}

const refusedOnce = (errors: Record<string, string>, code = "", status = 400) =>
  post.mockImplementationOnce(async () => {
    throw new ApiError("Validation failed.", status, errors, code);
  });

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "gate" }));
  refusalToast.mockReset();
});

describe("a refused record on the phone", () => {
  it("is counted as 上传失败 apart from 等待上传, with a reason - never 「Validation failed.」", async () => {
    await queueGatePhoto("gate-a");
    await queueGatePhoto("gate-b");
    refusedOnce({ photos: "The submitted file is empty." });
    post.mockImplementationOnce(async () => {
      throw new ApiError("no answer", 0);
    });

    await queue.flushOfflineJobs("guard");

    expect(await queue.getOfflineQueueSummary("guard")).toEqual({ pending: 2, failed: 1 });
    const [refused] = (await queue.getOfflineQueueEntries("guard")).filter(
      (entry) => entry.state === "failed",
    );
    expect(refused.kind).toBe("GATE_PHOTO");
    expect(refused.reason).toEqual({ key: "offline.refused.field.photos" });
    // The sentence every other screen reads is the worded one too.
    expect(refused.lastError).not.toBe("Validation failed.");
    // Said once by the pass, pointing at the sign - not per record.
    expect(refusalToast).toHaveBeenCalledTimes(1);
    expect(refusalToast).toHaveBeenCalledWith("offline.status.refusedToast", { count: 1 });
  });

  it("is left alone by the automatic passes, and 「重试」 sends that one alone", async () => {
    await queueGatePhoto("gate-a");
    refusedOnce({ members: "Choose people who work on this project." });
    await queue.flushOfflineJobs("guard");
    const [job] = [...store.values()];
    expect(job.needsAttention).toBe(true);

    post.mockClear();
    await queue.flushOfflineJobs("guard");
    expect(post).not.toHaveBeenCalled();

    await queueGatePhoto("gate-b");
    post.mockClear();
    await queue.retryOfflineJob("guard", job.id);
    expect(post).toHaveBeenCalledTimes(1);
    expect((post.mock.calls[0][1] as FormData).get("client_event_id")).toBe("gate-a-record");
    expect(store.has(job.id)).toBe(false);
    // The other record keeps its own turn.
    expect(store.size).toBe(1);
  });

  it("「删除这一条」 removes it from the phone", async () => {
    await queueGatePhoto("gate-a");
    refusedOnce({ photo_meta: "bad" });
    await queue.flushOfflineJobs("guard");
    const [job] = [...store.values()];

    await queue.discardOfflineJob(job.id);

    expect(await queue.getOfflineQueueSummary("guard")).toEqual({ pending: 0, failed: 0 });
  });

  it("sends the photo's real bytes, read before the upload", async () => {
    await queueGatePhoto("gate-a", shot("JPEG-BYTES"));
    await queue.flushOfflineJobs("guard");
    const sent = (post.mock.calls[0][1] as FormData).get("photos") as File;
    expect(sent.name).toBe("lorry.jpg");
    expect(await sent.text()).toBe("JPEG-BYTES");
  });

  it("does not send a photo the phone can no longer read, and says to take it again", async () => {
    await queueGatePhoto("gate-a", shot(""));
    await queue.flushOfflineJobs("guard");

    expect(post).not.toHaveBeenCalled();
    const [entry] = await queue.getOfflineQueueEntries("guard");
    expect(entry.state).toBe("failed");
    expect(entry.reason).toEqual({ key: "offline.refused.photoLost" });
  });

  it("is handled the same for every kind of record", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitAttendanceOfflineAware("guard", {
      project: "p1",
      event: "CLOCK_IN",
      latitude: "3.115105712345",
      longitude: "101.7297750",
    });
    vi.stubGlobal("navigator", { onLine: true });
    expect(store.size).toBe(1);
    refusedOnce({ latitude: "Ensure that there are no more than 7 decimal places." }, "validation_failed");
    await queue.flushOfflineJobs("guard");
    expect((await queue.getOfflineQueueEntries("guard"))[0].reason).toEqual({
      key: "offline.refused.field.location",
    });

    const [job] = [...store.values()];
    await queue.discardOfflineJob(job.id);
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitAttendanceOfflineAware("guard", { project: "p1", event: "CLOCK_OUT" });
    vi.stubGlobal("navigator", { onLine: true });
    refusedOnce({}, "", 403);
    await queue.flushOfflineJobs("guard");
    const [entry] = await queue.getOfflineQueueEntries("guard");
    expect(entry.state).toBe("failed");
    expect(entry.reason).toEqual({ key: "offline.conflict.forbidden" });
  });
});
