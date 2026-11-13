import { afterEach, describe, expect, it, vi } from "vitest";

import type { HeldRainRecord, OfflineJob } from "@/lib/offline-db";

/**
 * JB192 (客户第 4、6 点): 【提交雨天记录】 sends both photographs together
 * through the existing offline queue - at once with signal, queued without,
 * uploaded by itself later - and a retry or a replay is the same record (the
 * `client_event_id` made with the first photo). A refusal is thrown to the
 * screen, nothing is queued for it. IndexedDB is a map here and the network a
 * mock, so what runs is the real store-then-replay.
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "r-1", record_no: "PG-A-001" }));

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
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");
const { ApiError } = await import("@/interfaces/api");
const { heldPhoto, startHeldRain, withEndPhoto } = await import("@/lib/rain-record");
const { storeFile } = await import("@/lib/offline-db");

async function held(): Promise<HeldRainRecord> {
  const first = await storeFile(new File(["rain"], "start.jpg", { type: "image/jpeg", lastModified: 1 }));
  const second = await storeFile(new File(["stop"], "end.jpg", { type: "image/jpeg", lastModified: 2 }));
  return withEndPhoto(
    startHeldRain({
      ownerId: "ahmad",
      project: "p-1",
      clientEventId: "rain-abc",
      start: heldPhoto(first, "2026-11-13T06:05:00.000Z", { latitude: "3.1149475", longitude: "101.7294695" }),
    }),
    heldPhoto(second, "2026-11-13T07:10:00.000Z"),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "r-1", record_no: "PG-A-001" }));
});

describe("【提交雨天记录】 (JB192-3)", () => {
  it("sends both photos at once with signal", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(await queue.submitRainRecordOfflineAware("ahmad", await held(), "device-1")).toBe("uploaded");
    const [url, data] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/site-progress/create_rain_record/");
    expect(data.get("client_event_id")).toBe("rain-abc");
    expect(data.get("start_captured_at")).toBe("2026-11-13T06:05:00.000Z");
    expect(data.get("end_captured_at")).toBe("2026-11-13T07:10:00.000Z");
    expect(data.get("start_latitude")).toBe("3.1149475");
    expect(data.get("end_latitude")).toBeNull();
    expect(data.get("device_id")).toBe("device-1");
    expect(data.get("start_photo")).toBeInstanceOf(File);
    expect(data.get("end_photo")).toBeInstanceOf(File);
    expect(store.size).toBe(0);
  });

  it("waits in the queue with no signal, both photos as bytes, and goes by itself later", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(await queue.submitRainRecordOfflineAware("ahmad", await held())).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    const [job] = [...store.values()];
    expect(job.kind).toBe("RAIN_RECORD");
    if (job.kind !== "RAIN_RECORD") throw new Error("wrong kind");
    expect(job.id).toBe("rain-record-job-rain-abc");
    expect(job.payload.start_photo.bytes).toBeInstanceOf(ArrayBuffer);
    expect(job.payload.end_photo.bytes).toBeInstanceOf(ArrayBuffer);

    vi.stubGlobal("navigator", { onLine: true });
    const flushed = await queue.flushOfflineJobs("ahmad");
    expect(flushed.synced).toBe(1);
    const [url, data] = post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/site-progress/create_rain_record/");
    // The photos' own moments, hours later: never the upload time.
    expect(data.get("end_captured_at")).toBe("2026-11-13T07:10:00.000Z");
    expect(data.get("client_event_id")).toBe("rain-abc");
    expect(store.size).toBe(0);
  });

  it("keeps one client event id from a lost answer to the replay, and one job however often pressed", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementationOnce(async () => {
      throw new ApiError("offline", 0);
    });
    const record = await held();
    expect(await queue.submitRainRecordOfflineAware("ahmad", record)).toBe("queued");
    vi.stubGlobal("navigator", { onLine: false });
    // Pressed again before the signal came back: still the one job.
    await queue.submitRainRecordOfflineAware("ahmad", record);
    expect(store.size).toBe(1);

    vi.stubGlobal("navigator", { onLine: true });
    await queue.flushOfflineJobs("ahmad");
    const ids = post.mock.calls.map((call) => (call[1] as FormData).get("client_event_id"));
    expect(new Set(ids)).toEqual(new Set(["rain-abc"]));
  });

  it("throws a refusal to the screen and queues nothing (JB192-8)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementationOnce(async () => {
      throw new ApiError("full", 409, { limit: "5", minutes: "30" }, "rain_record_quota_full");
    });
    await expect(queue.submitRainRecordOfflineAware("ahmad", await held())).rejects.toMatchObject({
      status: 409,
      code: "rain_record_quota_full",
    });
    expect(store.size).toBe(0);
  });
});
