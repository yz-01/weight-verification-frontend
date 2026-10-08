import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import type { OfflineJob } from "@/lib/offline-db";

/**
 * Phone uploads stuck on 「等待上传」 (A9).
 *
 * On a weak site signal the queue used to stop at the first upload that hit a
 * network error: no try counted, no reason stored, and every record queued
 * behind it waited too. A refusal (4xx) was retried on every pass, forever.
 *
 * IndexedDB is a map and the network a mock, so what runs is the real queue:
 * one failing upload, then a second one behind it that must still go out.
 */

const store = new Map<string, OfflineJob>();
const post = vi.fn();

vi.mock("@/lib/offline-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline-db")>()),
  getOfflineJobs: async (ownerId: string) =>
    [...store.values()]
      .filter((job) => job.ownerId === ownerId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)),
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

const OWNER = "site-worker";
let clock = 0;

function online(value: boolean) {
  vi.stubGlobal("navigator", { onLine: value });
}

function tick() {
  clock += 1000;
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 6, 9, 0, 0) + clock));
}

/** One site photo for a field task, queued while the signal is gone. */
async function queuePhoto(taskId: string) {
  tick();
  return queue.submitFieldTaskPhotoOfflineAware(OWNER, {
    taskId,
    file: new File(["jpeg"], `${taskId}.jpg`, { type: "image/jpeg" }),
  });
}

function uploadsTo(taskId: string) {
  return post.mock.calls.filter(([url]) => String(url).includes(`/${taskId}/`));
}

async function entry(taskId: string) {
  const entries = await queue.getOfflineQueueEntries(OWNER);
  return entries.find((row) => row.reference === taskId);
}

/** The first upload fails as given; every other upload goes through. */
function firstFails(failure: unknown) {
  post.mockImplementation(async (url: string) => {
    if (url.includes("/first/")) throw failure;
    return {};
  });
}

beforeEach(() => {
  store.clear();
  post.mockReset();
  post.mockResolvedValue({});
  vi.useFakeTimers();
  tick();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a network error on the first upload", () => {
  it("counts the try, says why, and still uploads the second", async () => {
    online(false);
    await queuePhoto("first");
    await queuePhoto("second");
    online(true);
    firstFails(new ApiError("network", 0));

    const result = await queue.flushOfflineJobs(OWNER);

    expect(result).toEqual({ synced: 1, remaining: 1 });
    expect(uploadsTo("second")).toHaveLength(1);
    expect(await entry("first")).toMatchObject({
      attempts: 1,
      lastError: "network",
      state: "retrying",
    });
    expect(queue.queueErrorKey("network")).toBe("offline.reason.network");
  });

  it("keeps retrying it on the next pass and counts each try", async () => {
    online(false);
    await queuePhoto("first");
    online(true);
    firstFails(new ApiError("network", 0));
    await queue.flushOfflineJobs(OWNER);
    await queue.flushOfflineJobs(OWNER);
    expect(uploadsTo("first")).toHaveLength(2);
    expect((await entry("first"))?.attempts).toBe(2);

    post.mockResolvedValue({});
    await queue.flushOfflineJobs(OWNER);
    expect(store.size).toBe(0);
  });
});

describe("an upload that timed out", () => {
  it("says it timed out, counts the try, and still uploads the second", async () => {
    online(false);
    await queuePhoto("first");
    await queuePhoto("second");
    online(true);
    firstFails(new ApiError("timeout", 0, {}, "timeout"));

    await queue.flushOfflineJobs(OWNER);

    expect(uploadsTo("second")).toHaveLength(1);
    expect(await entry("first")).toMatchObject({
      attempts: 1,
      lastError: "timeout",
      state: "retrying",
    });
    expect(queue.queueErrorKey("timeout")).toBe("offline.reason.timeout");
  });
});

describe("an upload the server refused (4xx)", () => {
  it("marks it 需要处理 with the server's reason, stops retrying it, and uploads the second", async () => {
    online(false);
    await queuePhoto("first");
    await queuePhoto("second");
    online(true);
    firstFails(new ApiError("The photo is too large.", 413, {}, "payload_too_large"));

    await queue.flushOfflineJobs(OWNER);

    expect(uploadsTo("second")).toHaveLength(1);
    expect(await entry("first")).toMatchObject({
      attempts: 1,
      lastError: "The photo is too large.",
      state: "failed",
    });
    expect(queue.queueErrorKey("The photo is too large.")).toBeNull();

    // The automatic passes leave it alone ...
    await queue.flushOfflineJobs(OWNER);
    expect(uploadsTo("first")).toHaveLength(1);
    expect(await queue.getOfflineQueueSummary(OWNER)).toEqual({ pending: 1, failed: 1 });

    // ... until the worker presses 立即重试.
    post.mockResolvedValue({});
    await queue.flushOfflineJobs(OWNER, { includeRefused: true });
    expect(uploadsTo("first")).toHaveLength(2);
    expect(store.size).toBe(0);
  });

  it("keeps retrying a server error (5xx) by itself", async () => {
    online(false);
    await queuePhoto("first");
    online(true);
    firstFails(new ApiError("Server error", 503));
    await queue.flushOfflineJobs(OWNER);
    await queue.flushOfflineJobs(OWNER);
    expect(uploadsTo("first")).toHaveLength(2);
    expect((await entry("first"))?.state).toBe("retrying");
  });
});

describe("two sync triggers at once", () => {
  it("uploads each record once", async () => {
    online(false);
    await queuePhoto("first");
    await queuePhoto("second");
    online(true);
    let release: () => void = () => undefined;
    post.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));

    const one = queue.flushOfflineJobs(OWNER);
    const two = queue.flushOfflineJobs(OWNER);
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    release();
    await Promise.all([one, two]);

    expect(uploadsTo("first")).toHaveLength(1);
    expect(uploadsTo("second")).toHaveLength(1);
    expect(store.size).toBe(0);
  });
});
