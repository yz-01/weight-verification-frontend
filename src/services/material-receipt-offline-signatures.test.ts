import { afterEach, describe, expect, it, vi } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";

/**
 * A delivery queued offline still carries both signatures on replay (T-401, D-280).
 *
 * The server refuses an ENTRY photographed on site without `signature` and
 * `supplier_signature`. If the queue dropped either while storing the job,
 * every delivery taken without signal would be refused when the phone came
 * back online - long after the supplier had driven away. IndexedDB is a map
 * here and the network a mock, so what runs is the real store-then-replay.
 */
const store = new Map<string, OfflineJob>();
const post = vi.fn(async () => ({ id: "receipt" }));

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
  api: { post: (...args: unknown[]) => post(...(args as [])) },
  toastSuccess: () => undefined,
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");

const file = (name: string) => new File([name], name, { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockClear();
});

describe("offline material delivery", () => {
  it("is queued with both signatures and replays them", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await queue.submitMaterialReceiptOfflineAware("worker", {
      receipt: {
        project: "p1",
        supplier: "s1",
        movement_type: "ENTRY",
        material_name: "Cement",
        quantity: "10",
        unit: "BAG",
        category: "c1",
        vehicle_plate: "WXY 1234",
        delivery_note_no: "DO-88",
        received_by_name: "Worker",
      },
      signature: file("receiver.png"),
      supplierSignature: file("supplier.png"),
      sitePhotos: [file("arrival.jpg"), file("unloading.jpg")],
      deviceId: "phone",
    });
    expect(result).toBe("queued");
    expect(post).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", { onLine: true });
    const flushed = await queue.flushOfflineJobs("worker");
    expect(flushed.synced).toBe(1);

    const [url, data] = post.mock.calls.at(-1) as unknown as [string, FormData];
    expect(url).toBe("/api/receipts/create_receipt/");
    expect((data.get("signature") as File).name).toBe("receiver.png");
    expect((data.get("supplier_signature") as File).name).toBe("supplier.png");
    expect(data.get("vehicle_plate")).toBe("WXY 1234");
    expect(data.get("delivery_note_no")).toBe("DO-88");
  });
});
