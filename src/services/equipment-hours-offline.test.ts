import { afterEach, describe, expect, it, vi } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";

/**
 * 设备操作员工时 with no signal (2026-10 B15).
 *
 * The operator photographs his machine where the site has no network. The
 * photo has to wait on the phone with the moment it was taken - the hours are
 * counted from it, not from when the phone found signal - and reach the
 * server once, however often the queue retries. IndexedDB is a map here and
 * the network a mock, so what runs is the real store-then-replay.
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
  id: "log",
  session: null,
}));

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

const shot = () => new File(["machine"], "machine.jpg", { type: "image/jpeg" });

const draft = {
  equipment: "eq-1",
  equipmentLabel: "EQ-001 · Excavator · WXY 1234",
  kind: "START" as const,
  photo: shot(),
  latitude: "3.1149475",
  longitude: "101.7294695",
  locationAccuracyM: "12.00",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "log", session: null }));
});

describe("an equipment-hours photo taken offline", () => {
  it("waits on the phone as its own job kind, with the moment it was taken", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T07:58:00+08:00"));
    vi.stubGlobal("navigator", { onLine: false });

    const result = await queue.submitEquipmentHoursPhotoOfflineAware("ahmad", draft);

    expect(result).toEqual({ status: "queued" });
    expect(post).not.toHaveBeenCalled();
    const [job] = [...store.values()];
    expect(job.kind).toBe("EQUIPMENT_HOURS_PHOTO");
    if (job.kind !== "EQUIPMENT_HOURS_PHOTO") throw new Error("wrong kind");
    expect(job.payload.capturedAt).toBe("2026-10-06T23:58:00.000Z");
    expect(job.payload.equipmentLabel).toBe("EQ-001 · Excavator · WXY 1234");
    expect(job.payload.kind).toBe("START");
    expect(job.payload.photo.blob).toBeInstanceOf(Blob);

    // The phone finds signal at lunchtime: the start is still 07:58.
    vi.setSystemTime(new Date("2026-10-07T12:30:00+08:00"));
    vi.stubGlobal("navigator", { onLine: true });
    const flushed = await queue.flushOfflineJobs("ahmad");

    expect(flushed.synced).toBe(1);
    const [url, data] = post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/equipment-hours/upload_photo/");
    expect(data.get("equipment")).toBe("eq-1");
    // 开工 or 收工 travels with the photo through the queue.
    expect(data.get("kind")).toBe("START");
    expect(data.get("captured_at")).toBe("2026-10-06T23:58:00.000Z");
    expect(data.get("client_event_id")).toBe(job.payload.clientEventId);
    expect(data.get("latitude")).toBe("3.1149475");
    expect(data.get("location_accuracy_m")).toBe("12.00");
    expect(data.get("photo")).toBeInstanceOf(File);
    expect(store.size).toBe(0);
  });

  it("starts the day when the shutter closed, not when 发送 was pressed (#30, Q29.10)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T08:20:00+08:00"));
    vi.stubGlobal("navigator", { onLine: false });

    await queue.submitEquipmentHoursPhotoOfflineAware("ahmad", {
      ...draft,
      capturedAt: "2026-10-07T07:58:00+08:00",
    });

    const [job] = [...store.values()];
    if (job.kind !== "EQUIPMENT_HOURS_PHOTO") throw new Error("wrong kind");
    expect(job.payload.capturedAt).toBe("2026-10-06T23:58:00.000Z");

    // Through the queue unchanged, hours later.
    vi.setSystemTime(new Date("2026-10-07T12:30:00+08:00"));
    vi.stubGlobal("navigator", { onLine: true });
    await queue.flushOfflineJobs("ahmad");
    const [, data] = post.mock.calls.at(-1) as [string, FormData];
    expect(data.get("captured_at")).toBe("2026-10-06T23:58:00.000Z");
  });

  it("never dates a photo after the moment it is sent (a phone clock running ahead)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T08:20:00+08:00"));
    vi.stubGlobal("navigator", { onLine: false });

    await queue.submitEquipmentHoursPhotoOfflineAware("ahmad", {
      ...draft,
      capturedAt: "2026-10-07T11:00:00+08:00",
    });
    await queue.submitEquipmentHoursPhotoOfflineAware("ahmad", { ...draft, capturedAt: "garbage" });

    const moments = [...store.values()].map((job) =>
      job.kind === "EQUIPMENT_HOURS_PHOTO" ? job.payload.capturedAt : "",
    );
    expect(moments).toEqual(["2026-10-07T00:20:00.000Z", "2026-10-07T00:20:00.000Z"]);
  });

  it("keeps one client event id from the lost answer to the replay", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    // The request reached the server and the answer was lost on the way back.
    post.mockImplementationOnce(async () => {
      throw new ApiError("offline", 0);
    });

    const result = await queue.submitEquipmentHoursPhotoOfflineAware("ahmad", draft);

    expect(result).toEqual({ status: "queued" });
    const first = (post.mock.calls[0] as [string, FormData])[1].get("client_event_id");
    await queue.flushOfflineJobs("ahmad");
    const replay = (post.mock.calls.at(-1) as [string, FormData])[1].get("client_event_id");
    expect(replay).toBe(first);
  });

  it("answers with the machine's session when it uploads straight away", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementationOnce(async () => ({
      id: "log",
      session: { photo_count: 1, missing_end: true },
    }));

    const result = await queue.submitEquipmentHoursPhotoOfflineAware("ahmad", draft);

    expect(result.status).toBe("uploaded");
    if (result.status !== "uploaded") throw new Error("not uploaded");
    expect(result.upload.session?.missing_end).toBe(true);
    expect(store.size).toBe(0);
  });
});
