import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 「全部模块的OCR应该是统一用材料进场的那个OCR才对」 (Lucas, 2026-09-26).
 *
 * Every screen that reads a delivery-note photo into a form goes through
 * useDeliveryNoteReader: read on capture, the same messages, stale answers
 * dropped. The server side is receiving.ocr.read_delivery_note for both.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("one delivery-note reader for every module", () => {
  it.each([
    ["src/components/field-staff/field-records-panel.tsx", "readDeliveryNote"],
    ["src/components/contractor-ops/operations-workspaces.tsx", "ocrEquipmentDeliveryNote"],
  ])("%s reads through useDeliveryNoteReader", (file, endpoint) => {
    const source = read(file);
    expect(source).toMatch(new RegExp(String.raw`useDeliveryNoteReader\(\{\s*read: ${endpoint},`));
    expect(source).toMatch(/<DeliveryNoteReadStatus reader=\{ocr\}/);
  });

  it("equipment reads on capture, with no 【使用 Azure OCR 读取】 button", () => {
    const source = read("src/components/contractor-ops/operations-workspaces.tsx");
    expect(source).toMatch(/setDeliveryNotePhoto\(image\);\s*ocr\.inspect\(row\.project, image\);/);
    expect(source).not.toMatch(/equipment\.readDeliveryNote/);
  });

  it("equipment gets the same result type as material receipts", () => {
    const service = read("src/services/contractor-ops.service.ts");
    expect(service).toMatch(/api\.post<DeliveryNoteOCRResult>\("\/api\/site-equipment\/ocr_delivery_note\/"/);
  });
});
