import { afterEach, describe, expect, it, vi } from "vitest";

import { NO_LOCATION } from "@/lib/field-location";
import type { OfflineJob } from "@/lib/offline-db";

/**
 * 新增进度证据 with no GPS fix (client 2026-11-09 item 6): 「GPS 定位失败不阻止
 * 拍照和保存，资料先进入离线缓存，网络恢复后自动同步。注意：GPS 定位失败不能
 * 事后用新的位置冒充拍摄时的位置。」
 *
 * The record saved as 「没有定位」 waits in the same offline queue as every
 * other phone record and is replayed as it was saved: when the phone has a
 * GPS fix by the time it syncs, that fix is still not sent. IndexedDB is a
 * map here and the network a mock, so what runs is the real store-then-replay.
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "progress" }));

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
const { ApiError } = await import("@/interfaces/api");

/** What the progress form sends, with the location value it held at 提交. */
function draft(location: { latitude?: string; longitude?: string }) {
  return {
    project: "p-1",
    description: "Slab poured",
    captured_at: "2026-11-09T02:00:00.000Z",
    latitude: location.latitude,
    longitude: location.longitude,
    client_event_id: "progress-1",
    photos: [new File(["shot"], "shot.jpg", { type: "image/jpeg" })],
  };
}

/** A phone whose GPS now answers at once - the fix that must not be used. */
function gpsNowWorks() {
  const getCurrentPosition = vi.fn((done: (position: unknown) => void) =>
    done({ coords: { latitude: 3.139, longitude: 101.6869, accuracy: 8 } }),
  );
  const watchPosition = vi.fn(() => 1);
  return { getCurrentPosition, watchPosition };
}

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "progress" }));
});

describe("a progress record saved without a GPS fix", () => {
  it("offline: waits in the queue and syncs later still without a position", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await queue.submitSiteProgressOfflineAware("worker", draft(NO_LOCATION));
    expect(result).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    const [job] = [...store.values()];
    expect(job.kind).toBe("SITE_PROGRESS");
    if (job.kind !== "SITE_PROGRESS") throw new Error("wrong kind");
    expect(job.payload.latitude).toBeUndefined();
    expect(job.payload.longitude).toBeUndefined();

    // Back online, and GPS works now: the replay still sends no position.
    const geolocation = gpsNowWorks();
    vi.stubGlobal("navigator", { onLine: true, geolocation });
    const flushed = await queue.flushOfflineJobs("worker");
    expect(flushed.synced).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, data] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/site-progress/create_record/");
    expect(data.get("client_event_id")).toBe("progress-1");
    expect(data.getAll("photos")).toHaveLength(1);
    expect(data.has("latitude")).toBe(false);
    expect(data.has("longitude")).toBe(false);
    expect(data.has("location_accuracy_m")).toBe(false);
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it("online with a lost answer: the retry from the queue sends no position either", async () => {
    const geolocation = gpsNowWorks();
    vi.stubGlobal("navigator", { onLine: true, geolocation });
    post.mockRejectedValueOnce(new ApiError("offline", 0));
    const result = await queue.submitSiteProgressOfflineAware("worker", draft(NO_LOCATION));
    expect(result).toBe("queued");
    await queue.flushOfflineJobs("worker");
    expect(post).toHaveBeenCalledTimes(2);
    for (const [, data] of post.mock.calls as [string, FormData][]) {
      expect(data.has("latitude")).toBe(false);
      expect(data.has("longitude")).toBe(false);
      expect(data.get("client_event_id")).toBe("progress-1");
    }
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("a record saved with a fix keeps exactly that fix", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitSiteProgressOfflineAware(
      "worker",
      draft({ latitude: "2.1000000", longitude: "102.2000000" }),
    );
    vi.stubGlobal("navigator", { onLine: true, geolocation: gpsNowWorks() });
    await queue.flushOfflineJobs("worker");
    const [, data] = post.mock.calls[0] as [string, FormData];
    expect(data.get("latitude")).toBe("2.1000000");
    expect(data.get("longitude")).toBe("102.2000000");
  });
});
