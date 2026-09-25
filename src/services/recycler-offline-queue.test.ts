import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import type { OfflineJob } from "@/lib/offline-db";

/**
 * The recycler console's offline queue (T-059 AC-049, T-060 AC-050).
 *
 * Verified without a browser, as Lucas asked (D-262): IndexedDB is replaced by
 * a map and the network by a mock, so what runs is the real queue - folding a
 * second press, holding an order's later steps behind a refused one, the four
 * states, the words for each refusal. What this cannot show is a real browser
 * losing its network; that walk-through is Lucas's (C-021).
 *
 * The server half of the same six situations - that the database ends with no
 * duplicate - is `waste/tests/test_offline_six_cases.py` in the backend.
 */

const store = new Map<string, OfflineJob>();
const provenance: string[] = [];
const post = vi.fn();
const toasts: string[] = [];

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
  toastSuccess: (key: string) => {
    toasts.push(key);
  },
  withOfflineProvenance: async <T,>(createdAt: string, run: () => Promise<T>) => {
    provenance.push(createdAt);
    return run();
  },
}));

const queue = await import("@/services/offline-sync.service");

const OWNER = "recycler-user";
let clock = 0;

function online(value: boolean) {
  vi.stubGlobal("navigator", { onLine: value });
}

/** Queue times must differ, or "the order they were queued in" is a coin toss. */
function tick() {
  clock += 1000;
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 25, 9, 0, 0) + clock));
}

async function accept(dispatchId: string) {
  tick();
  return queue.submitDispatchAcceptOfflineAware(OWNER, {
    dispatchId,
    dispatchNo: `DS-${dispatchId}`,
    recyclerReference: "RC-1",
    proposedCollectionAt: "2026-09-27T09:00:00.000Z",
  });
}

async function collect(dispatchId: string) {
  tick();
  return queue.submitDispatchCollectOfflineAware(OWNER, {
    dispatchId,
    dispatchNo: `DS-${dispatchId}`,
    recyclerReference: "RC-1",
  });
}

async function assign(dispatchId: string, driver = "driver-1", clientEventId?: string) {
  tick();
  return queue.enqueueTripAssign(OWNER, {
    dispatchId,
    dispatchNo: dispatchId ? `DS-${dispatchId}` : "",
    site: "yard-1",
    vehicle: "lorry-1",
    driver,
    clientEventId,
  });
}

function sentTo(fragment: string) {
  return post.mock.calls.filter(([url]) => String(url).includes(fragment));
}

function refuse(status: number, code: string) {
  return new ApiError("refused", status, {}, code);
}

beforeEach(() => {
  store.clear();
  provenance.length = 0;
  toasts.length = 0;
  post.mockReset();
  post.mockResolvedValue({});
  vi.useFakeTimers();
  tick();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("1 · offline for ten minutes, then the network returns", () => {
  it("queues without sending, then sends each action once with the time it was taken", async () => {
    online(false);
    expect(await accept("A")).toBe("queued");
    expect(await collect("B")).toBe("queued");
    expect(await assign("C")).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    const queuedAt = [...store.values()].map((job) => job.queuedAt).sort();

    vi.setSystemTime(new Date(Date.parse(queuedAt[0]) + 10 * 60_000));
    online(true);
    const result = await queue.flushOfflineJobs(OWNER);

    expect(result).toEqual({ synced: 3, remaining: 0 });
    expect(post).toHaveBeenCalledTimes(3);
    // The replay says when each was done on the device, not when it arrived.
    expect(provenance).toEqual(queuedAt);
    const ids = post.mock.calls.map(([, body]) => (body as { client_event_id: string }).client_event_id);
    expect(new Set(ids).size).toBe(3);
  });

  it("shows each synced action as 已同步", async () => {
    online(false);
    await accept("A");
    online(true);
    await queue.flushOfflineJobs(OWNER);
    const synced = queue.getRecentlySynced(OWNER);
    expect(synced[0]).toMatchObject({ kind: "DISPATCH_ACCEPT", reference: "DS-A" });
  });
});

describe("2 · the same button pressed again", () => {
  it("folds a second acceptance of the same order into the one already waiting", async () => {
    online(false);
    await accept("A");
    await accept("A");
    expect(store.size).toBe(1);
    expect(toasts).toContain("offline.alreadyQueued");
  });

  it("does not race the queue with a new id once the network is back", async () => {
    online(false);
    await collect("A");
    online(true);
    expect(await collect("A")).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    expect(store.size).toBe(1);
  });

  it("keeps one trip per order, and one per identical order-less trip", async () => {
    online(false);
    await assign("A");
    await assign("A", "driver-2");
    await assign("");
    await assign("");
    await assign("", "driver-2");
    expect([...store.values()].map((job) => job.kind)).toEqual([
      "TRIP_ASSIGN",
      "TRIP_ASSIGN",
      "TRIP_ASSIGN",
    ]);
  });

  it("keeps a different order's action as its own", async () => {
    online(false);
    await accept("A");
    await accept("B");
    expect(store.size).toBe(2);
  });
});

describe("3 · the network comes back, or drops again mid-sync", () => {
  it("keeps a job whose answer was lost, unfailed, and sends it again with the same id", async () => {
    online(false);
    await assign("A", "driver-1", "trip-assign-press-1");
    online(true);
    post.mockRejectedValueOnce(new ApiError("network", 0));
    expect(await queue.flushOfflineJobs(OWNER)).toEqual({ synced: 0, remaining: 1 });
    const [waiting] = await queue.getOfflineQueueEntries(OWNER);
    expect(waiting).toMatchObject({ state: "waiting", attempts: 0 });

    await queue.flushOfflineJobs(OWNER);
    expect(sentTo("create_task").map(([, body]) => (body as { client_event_id: string }).client_event_id)).toEqual([
      "trip-assign-press-1",
      "trip-assign-press-1",
    ]);
    expect(store.size).toBe(0);
  });

  it("shows 同步中 on the job being sent", async () => {
    online(false);
    await accept("A");
    online(true);
    let release: () => void = () => undefined;
    post.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const flushing = queue.flushOfflineJobs(OWNER);
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect((await queue.getOfflineQueueEntries(OWNER))[0].state).toBe("syncing");
    release();
    await flushing;
    expect(await queue.getOfflineQueueEntries(OWNER)).toEqual([]);
  });
});

describe("4 · the order changed on the server while offline", () => {
  it("keeps the refused step, holds that order's later steps, and lets other orders through", async () => {
    online(false);
    await accept("A");
    await assign("A");
    await collect("A");
    await accept("B");
    online(true);
    post.mockImplementation(async (url: string) => {
      if (url.includes("/A/accept_dispatch/")) throw refuse(409, "dispatch_not_collectable");
      return {};
    });

    await queue.flushOfflineJobs(OWNER);

    expect(sentTo("/A/accept_dispatch/")).toHaveLength(1);
    expect(sentTo("create_task")).toHaveLength(0);
    expect(sentTo("/A/collect_dispatch/")).toHaveLength(0);
    expect(sentTo("/B/accept_dispatch/")).toHaveLength(1);
    const entries = await queue.getOfflineQueueEntries(OWNER);
    expect(entries.map((entry) => [entry.kind, entry.state])).toEqual([
      ["DISPATCH_ACCEPT", "failed"],
      ["TRIP_ASSIGN", "held"],
      ["DISPATCH_COLLECT", "held"],
    ]);
    expect(entries[0].hint).toBe("offline.conflict.changed");
  });

  it("sends the held steps once the refused one is discarded", async () => {
    online(false);
    await accept("A");
    await collect("A");
    online(true);
    post.mockRejectedValueOnce(refuse(409, "dispatch_not_collectable"));
    await queue.flushOfflineJobs(OWNER);
    const [refused] = await queue.getOfflineQueueEntries(OWNER);

    await queue.discardOfflineJob(refused.id);
    await queue.flushOfflineJobs(OWNER);
    expect(sentTo("/A/collect_dispatch/")).toHaveLength(1);
    expect(store.size).toBe(0);
  });
});

describe("5 · the permission was taken away", () => {
  it("keeps the action and says the account lost the right, instead of dropping it", async () => {
    online(false);
    await accept("A");
    online(true);
    post.mockRejectedValue(refuse(403, "permission_denied"));
    await queue.flushOfflineJobs(OWNER);
    const [entry] = await queue.getOfflineQueueEntries(OWNER);
    expect(entry).toMatchObject({ state: "failed", attempts: 1, hint: "offline.conflict.forbidden" });
  });
});

describe("6 · the load was given to another driver meanwhile", () => {
  it("says a trip was already rostered and that the first one was kept", async () => {
    online(false);
    await assign("A");
    online(true);
    post.mockRejectedValue(refuse(409, "task_already_running"));
    await queue.flushOfflineJobs(OWNER);
    const [entry] = await queue.getOfflineQueueEntries(OWNER);
    expect(entry.hint).toBe("offline.conflict.alreadyAssigned");
  });
});

describe("every refusal has words, in all four languages", () => {
  it("maps each kind of refusal to a sentence the catalogue has", () => {
    const hints = [
      queue.conflictHint(403, "permission_denied"),
      queue.conflictHint(404, "dispatch_not_found"),
      queue.conflictHint(409, "task_already_running"),
      queue.conflictHint(409, "dispatch_not_collectable"),
      queue.conflictHint(400, "validation_error"),
      queue.conflictHint(500, ""),
    ];
    expect(new Set(hints).size).toBe(6);
    expect(queue.conflictHint(undefined, undefined)).toBeNull();
    for (const locale of ["en", "zh", "zh-TW", "ms"]) {
      const messages = JSON.parse(
        readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"),
      );
      const read = (key: string) =>
        key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
      for (const key of [
        ...hints,
        "offline.alreadyQueued",
        "offline.queue.heldHint",
        "offline.queue.recent",
        ...["waiting", "syncing", "failed", "held", "synced"].map((state) => `offline.state.${state}`),
      ]) {
        expect(typeof read(key as string), `${locale}: ${key}`).toBe("string");
      }
    }
  });
});

describe("a browser cannot weigh offline (AC-049)", () => {
  it("queues no weighing action and caches no weight", () => {
    const source = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8");
    const kinds = /export type OfflineJobKind =([^;]+);/.exec(source("lib/offline-db.ts"))?.[1] ?? "";
    const snapshots = /export type RecyclerSnapshotKind =([^;]+);/.exec(source("lib/offline-db.ts"))?.[1] ?? "";
    expect(kinds).toContain("TRIP_ASSIGN");
    expect(kinds).not.toMatch(/WEIGH|TARE|GROSS|SCALE|TICKET/);
    expect(snapshots).not.toMatch(/WEIGH|TARE|GROSS|SCALE|TICKET/);
    const paths = source("services/offline-sync.service.ts").match(/["'`]\/api\/[^"'`]+/g) ?? [];
    expect(paths.length).toBeGreaterThan(5);
    for (const route of paths) expect(route).not.toMatch(/weigh|tare|scale|ticket/i);
  });
});
