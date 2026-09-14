import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn(async () => ({ id: "saved-record" })));
vi.mock("@/services/api-client", () => ({
  api: { post }, download: vi.fn(), toastSuccess: vi.fn(),
}));

import { createReceiptWithEvidence } from "./contractor.service";
import { createConsultantFieldSubmission, createDisposalRequest, createMaterialOutgoing, createSiteProgressRecord } from "./contractor-ops.service";

const photo = (name: string) => new File([name], name, { type: "image/jpeg" });
const base = {
  project: "assigned-project", category: "chosen-column", client_event_id: "capture-1",
  captured_at: "2026-09-15T01:30:00Z", latitude: "3.1390000", longitude: "101.6869000",
};
const submitted = () => post.mock.calls.at(-1) as unknown as [string, FormData];

describe("field capture sends the original record and all evidence together", () => {
  beforeEach(() => post.mockClear());

  it("sends the material column, three site photos and DO without requiring signatures", async () => {
    const sitePhotos = [photo("arrival.jpg"), photo("unloading.jpg"), photo("empty.jpg")];
    await createReceiptWithEvidence({
      receipt: { ...base, supplier: "supplier", material_name: "Cement", quantity: "80", unit: "BAG", received_by_name: "Field Worker", total_weight_kg: null, ocr_proof: "signed-ocr" },
      sitePhotos, deliveryNotePhoto: photo("do.jpg"), deviceId: "phone",
    });
    const [url, data] = submitted();
    expect(post).toHaveBeenCalledTimes(1);
    expect(url).toBe("/api/receipts/create_receipt/");
    expect(data.get("category")).toBe(base.category);
    expect(data.get("project")).toBe(base.project);
    expect(data.get("ocr_proof")).toBe("signed-ocr");
    expect(data.has("signature")).toBe(false);
    expect(data.has("supplier_signature")).toBe(false);
    expect(data.has("total_weight_kg")).toBe(false);
    expect(data.getAll("photos").map((file) => (file as File).name)).toEqual(["arrival.jpg", "unloading.jpg", "empty.jpg", "do.jpg"]);
    expect(data.get("photo_kind_3")).toBe("DELIVERY_NOTE");
  });

  it("keeps optional signatures when supplied", async () => {
    await createReceiptWithEvidence({
      receipt: { ...base, supplier: "supplier", material_name: "Concrete", quantity: "2", unit: "M3", received_by_name: "Worker" },
      sitePhotos: [], signature: photo("receiver.jpg"), supplierSignature: photo("supplier.jpg"), deviceId: "phone",
    });
    expect((submitted()[1].get("signature") as File).name).toBe("receiver.jpg");
    expect((submitted()[1].get("supplier_signature") as File).name).toBe("supplier.jpg");
  });

  it.each(["progress", "outgoing", "disposal", "consultant"] as const)("preserves the chosen column and every photo for %s", async (kind) => {
    const photos = [photo("one.jpg"), photo("two.jpg"), photo("three.jpg"), photo("four.jpg")];
    if (kind === "progress") await createSiteProgressRecord({ ...base, phase: "phase", percent_complete: "25", photos });
    if (kind === "outgoing") await createMaterialOutgoing({ ...base, material_name: "Cement", quantity: "1", unit: "BAG", destination: "Store", executor_name: "Worker", reason: "Transfer", photos });
    if (kind === "disposal") await createDisposalRequest({ ...base, waste_description: "Debris", location_description: "Gate", accuracy_m: "5", photos });
    if (kind === "consultant") await createConsultantFieldSubmission({ ...base, application_category: "WIR", description: "Inspection", photos });
    const data = submitted()[1];
    expect(data.get("category")).toBe(base.category);
    expect(data.get("project")).toBe(base.project);
    expect(data.getAll("photos")).toHaveLength(4);
    expect(data.get("latitude")).toBe(base.latitude);
    expect(data.get("longitude")).toBe(base.longitude);
  });
});
