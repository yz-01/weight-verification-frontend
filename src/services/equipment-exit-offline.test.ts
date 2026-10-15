import { afterEach, describe, expect, it, vi } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";

/**
 * 设备退场 with no signal (2026-10 I13): 「提交（可离线）」.
 *
 * Both of the phone's steps go through the same queue as the entry, as the
 * same job kind: the application reaches `apply_exit`, the actual exit of an
 * approved one `record_exit_handover` with the machine's QR as scanned. A
 * one-step exit an older build queued (Q27) still reaches `record_exit`, where
 * the server files it as an application with all its evidence. Each keeps one
 * client_event_id from the first try to the last, so the server can tell a
 * replay from a second one. IndexedDB is a map here and the network a mock,
 * so what runs is the real store-then-replay.
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "mv" }));

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

const shot = (name: string) => new File([name], `${name}.jpg`, { type: "image/jpeg" });

function exitDraft(): Parameters<typeof queue.submitEquipmentMovementOfflineAware>[1] {
  return {
    entry: false,
    exit: true,
    project: "p-1",
    equipment: "m-1",
    direction: "EXIT",
    operator_name: "Ah Meng",
    supplier: "s-1",
    delivery_note_no: "DO-EXIT-9",
    vehicle_plate: "WXY 1234",
    notes: "Job finished",
    original_occurred_at: "2026-10-08T01:00:00.000Z",
    client_event_id: "exit-event-1",
    latitude: "3.1390000",
    longitude: "101.6869000",
    accuracy_m: "8",
    photos: [shot("a"), shot("b"), shot("c"), shot("d")],
    delivery_note_photo: shot("do"),
    receiver_signature: shot("site-sign"),
    supplier_signature: shot("driver-sign"),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "mv" }));
});

describe("a one-step exit an older build queued (Q27)", () => {
  it("waits on the phone and is sent to record_exit with its evidence", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const result = await queue.submitEquipmentMovementOfflineAware("ahmeng", exitDraft());

    expect(result).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    const [job] = [...store.values()];
    expect(job.kind).toBe("EQUIPMENT_MOVEMENT");

    vi.stubGlobal("navigator", { onLine: true });
    const flushed = await queue.flushOfflineJobs("ahmeng");

    expect(flushed.synced).toBe(1);
    const [url, data] = post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/site-equipment/record_exit/");
    expect(data.get("equipment")).toBe("m-1");
    expect(data.get("delivery_note_no")).toBe("DO-EXIT-9");
    expect(data.get("supplier")).toBe("s-1");
    expect(data.get("notes")).toBe("Job finished");
    expect(data.get("client_event_id")).toBe("exit-event-1");
    expect(data.getAll("photos")).toHaveLength(4);
    expect(data.get("delivery_note_photo")).toBeInstanceOf(File);
    expect(data.get("receiver_signature")).toBeInstanceOf(File);
    expect(data.get("supplier_signature")).toBeInstanceOf(File);
    // One exit is the machine (F3): no quantity, unit or application.
    expect(data.has("quantity")).toBe(false);
    expect(data.has("unit")).toBe(false);
    expect(data.has("movement")).toBe(false);
    expect(store.size).toBe(0);
  });

  it("keeps one client event id from the lost answer to the replay", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    // The request reached the server and the answer was lost on the way back.
    post.mockImplementationOnce(async () => {
      throw new ApiError("offline", 0);
    });

    const result = await queue.submitEquipmentMovementOfflineAware("ahmeng", exitDraft());

    expect(result).toBe("queued");
    const [firstUrl, first] = post.mock.calls[0] as [string, FormData];
    expect(firstUrl).toBe("/api/site-equipment/record_exit/");
    await queue.flushOfflineJobs("ahmeng");
    const [replayUrl, replay] = post.mock.calls.at(-1) as [string, FormData];
    expect(replayUrl).toBe("/api/site-equipment/record_exit/");
    expect(replay.get("client_event_id")).toBe(first.get("client_event_id"));
  });

  it("an entry queued the same way still goes to record_entry", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitEquipmentMovementOfflineAware("ahmeng", {
      ...exitDraft(),
      entry: true,
      exit: false,
      direction: "ENTRY",
      client_event_id: "entry-event-1",
    });
    vi.stubGlobal("navigator", { onLine: true });
    await queue.flushOfflineJobs("ahmeng");

    expect((post.mock.calls.at(-1) as [string, FormData])[0]).toBe("/api/site-equipment/record_entry/");
  });
});

describe("the exit's two steps taken offline (I13)", () => {
  it("an application waits on the phone and goes to apply_exit with its reason and photo", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const result = await queue.submitEquipmentMovementOfflineAware("ahmeng", {
      apply_exit: true,
      project: "p-1",
      equipment: "m-1",
      direction: "EXIT",
      operator_name: "Ah Meng",
      notes: "Hire ended",
      original_occurred_at: "2026-10-15T01:00:00.000Z",
      client_event_id: "apply-event-1",
      photos: [shot("going")],
    });

    expect(result).toBe("queued");
    expect(post).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", { onLine: true });
    await queue.flushOfflineJobs("ahmeng");

    const [url, data] = post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/site-equipment/apply_exit/");
    expect(data.get("equipment")).toBe("m-1");
    expect(data.get("notes")).toBe("Hire ended");
    expect(data.get("client_event_id")).toBe("apply-event-1");
    expect(data.getAll("photos")).toHaveLength(1);
    expect(data.has("receiver_signature")).toBe(false);
    expect(await queue.queuedEquipmentExit("ahmeng", { equipment: "m-1" })).toBe(false);
  });

  it("an application still waiting on the phone is said so for that machine", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitEquipmentMovementOfflineAware("ahmeng", {
      apply_exit: true,
      project: "p-1",
      equipment: "m-1",
      direction: "EXIT",
      operator_name: "Ah Meng",
      notes: "Hire ended",
      original_occurred_at: "2026-10-15T01:00:00.000Z",
      client_event_id: "apply-event-2",
      photos: [shot("going")],
    });

    expect(await queue.queuedEquipmentExit("ahmeng", { equipment: "m-1" })).toBe(true);
    expect(await queue.queuedEquipmentExit("ahmeng", { equipment: "m-2" })).toBe(false);
  });

  it("the actual exit goes to that exit's record_exit_handover, with the machine's QR", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await queue.submitEquipmentMovementOfflineAware("ahmeng", {
      ...exitDraft(),
      entry: false,
      exit: false,
      exit_handover: true,
      movement: "x-9",
      scanned_equipment: "https://trace.example/scan/equipment?equipment=m-1",
      client_event_id: "handover-event-1",
    });

    expect(await queue.queuedEquipmentExit("ahmeng", { movement: "x-9" })).toBe(true);
    vi.stubGlobal("navigator", { onLine: true });
    await queue.flushOfflineJobs("ahmeng");

    const [url, data] = post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/site-equipment/x-9/record_exit_handover/");
    expect(data.get("scanned_equipment")).toBe("https://trace.example/scan/equipment?equipment=m-1");
    expect(data.get("delivery_note_no")).toBe("DO-EXIT-9");
    expect(data.get("client_event_id")).toBe("handover-event-1");
    expect(data.getAll("photos")).toHaveLength(4);
    expect(data.get("receiver_signature")).toBeInstanceOf(File);
    expect(data.get("supplier_signature")).toBeInstanceOf(File);
    expect(data.has("movement")).toBe(false);
    expect(store.size).toBe(0);
  });
});
