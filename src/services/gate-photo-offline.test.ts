import { afterEach, describe, expect, it, vi } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";

/**
 * 门岗拍照 with no signal (H12 第3、4条, HD5): 「断网期间仍可拍照、填写资料，
 * 并暂存在手机本地。网络恢复后，未上传的资料自动同步，不能丢失或重复上传」.
 *
 * IndexedDB is a map here and the network a mock: the photo waits on the
 * phone with its own moment, fix and client_event_id, goes up once the
 * network is back, and a replay carries the same ids - which the server
 * answers with the record it already has (`site_access.test_gate_incidents`).
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "gate" }));

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
  toastOutcome: () => undefined,
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");

const shot = () => new File(["lorry"], "lorry.jpg", { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "gate" }));
});

describe("a gate photo taken offline", () => {
  it("waits on the phone and goes up once, with its ids, when the network is back", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const result = await queue.submitGatePhotoOfflineAware("guard", {
      project: "p1",
      is_issue: false,
      members: [],
      client_event_id: "gate-a-record",
      latitude: "3.1",
      longitude: "101.6",
      photos: [
        {
          file: shot(),
          captured_at: "2026-10-13T01:00:00.000Z",
          latitude: "3.1",
          longitude: "101.6",
          client_event_id: "gate-a",
        },
      ],
    });

    expect(result).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    const [job] = [...store.values()];
    expect(job.kind).toBe("GATE_PHOTO");
    if (job.kind !== "GATE_PHOTO") throw new Error("wrong kind");
    expect(job.payload.photos[0].blob).toBeInstanceOf(Blob);
    expect(job.payload.photo_meta[0]).toMatchObject({
      captured_at: "2026-10-13T01:00:00.000Z",
      client_event_id: "gate-a",
    });

    vi.stubGlobal("navigator", { onLine: true });
    const flushed = await queue.flushOfflineJobs("guard");

    expect(flushed.synced).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, data] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/gate-incidents/create_gate_incident/");
    expect(data.get("client_event_id")).toBe("gate-a-record");
    expect(data.get("is_issue")).toBe("false");
    expect(data.getAll("photos")).toHaveLength(1);
    expect(JSON.parse(String(data.get("photo_meta")))[0]).toMatchObject({
      captured_at: "2026-10-13T01:00:00.000Z",
      client_event_id: "gate-a",
    });
    expect(store.size).toBe(0);

    // Nothing left to send: a second flush sends nothing again.
    await queue.flushOfflineJobs("guard");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("queues a special matter with its note and people", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    await queue.submitGatePhotoOfflineAware("guard", {
      project: "p1",
      is_issue: true,
      members: ["u2"],
      first_message: "No exit slip",
      client_event_id: "gate-issue-1",
      photos: [{ file: shot(), captured_at: "2026-10-13T01:00:00.000Z", client_event_id: "gate-b" }],
    });

    vi.stubGlobal("navigator", { onLine: true });
    await queue.flushOfflineJobs("guard");
    const [, data] = post.mock.calls[0] as [string, FormData];
    expect(data.get("is_issue")).toBe("true");
    expect(data.get("first_message")).toBe("No exit slip");
    expect(data.getAll("members")).toEqual(["u2"]);
    expect(data.get("client_event_id")).toBe("gate-issue-1");
  });

  it("「发送并沟通」 online hands back the record, so its conversation opens at once (I14)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementation(async () => ({ id: "gate-issue", is_issue: true }));

    const result = await queue.submitGateIssueOfflineAware("guard", {
      project: "p1",
      is_issue: true,
      members: ["u2"],
      client_event_id: "gate-issue-2",
      photos: [{ file: shot(), captured_at: "2026-10-13T01:00:00.000Z", client_event_id: "gate-c" }],
    });

    expect(result).toEqual({ status: "uploaded", incident: { id: "gate-issue", is_issue: true } });
    expect(store.size).toBe(0);
    const [url, data] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/gate-incidents/create_gate_incident/");
    expect(data.get("is_issue")).toBe("true");
    expect(data.getAll("members")).toEqual(["u2"]);
    // Nothing typed: no first message is sent at all.
    expect(data.has("first_message")).toBe(false);
  });

  it("「发送并沟通」 with no signal waits on the phone and goes once, people and all", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const result = await queue.submitGateIssueOfflineAware("guard", {
      project: "p1",
      is_issue: true,
      members: ["u2"],
      client_event_id: "gate-issue-3",
      photos: [{ file: shot(), captured_at: "2026-10-13T01:00:00.000Z", client_event_id: "gate-d" }],
    });

    expect(result).toEqual({ status: "queued" });
    expect(post).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", { onLine: true });
    await queue.flushOfflineJobs("guard");
    expect(post).toHaveBeenCalledTimes(1);
    const [, data] = post.mock.calls[0] as [string, FormData];
    expect(data.get("client_event_id")).toBe("gate-issue-3");
    expect(data.getAll("members")).toEqual(["u2"]);
  });
});
