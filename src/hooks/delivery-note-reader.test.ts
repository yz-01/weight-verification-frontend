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
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

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

/**
 * A pending read never holds the record back (hotfix after the October
 * deploy). Lucas's iPhone stayed on 「读取中」 and 材料进场 could not be
 * submitted: 提交 was disabled while the read ran, and the read had no end.
 * Now 提交 does not look at the read at all, the read stops waiting at
 * `OCR_READ_TIMEOUT_MS` (`lib/delivery-note-read`), and a DO number typed
 * while it ran is kept when the answer lands. The screens render without a
 * DOM here, so these read the source the way the checks above do.
 */
describe("a delivery-note read never blocks 提交", () => {
  const screens = [
    "src/components/field-staff/field-records-panel.tsx",
    "src/components/contractor-ops/operations-workspaces.tsx",
  ];

  it.each(screens)("%s never disables a button on the read", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/disabled=\{[^}]*ocr\.reading/);
    expect(source).not.toMatch(/disabled=\{[^}]*reader\.reading/);
  });

  it("材料进场's 提交 waits only for its own request", () => {
    const source = read("src/components/field-staff/field-records-panel.tsx");
    expect(source).toMatch(/disabled=\{save\.isPending\} onClick=\{\(\) => save\.mutate\(\)\}/);
  });

  it("the reader stops waiting at the deadline and says to type it in", () => {
    const source = read("src/hooks/use-delivery-note-reader.tsx");
    expect(source).toMatch(/readWithin\(\(\) => read\(project, image, upload\.signal\), OCR_READ_TIMEOUT_MS\)/);
    // A read nobody waits for any more stops sending its photo.
    expect(source).toMatch(/if \(outcome\.kind === "timedOut"\) upload\.abort\(\);/);
    // A timed-out or failed read ends the spinner and falls back to manual entry.
    expect(source).toMatch(/if \(target\.current !== sent\) return;\s*setReading\(false\);/);
    expect(source).toMatch(/: t\("ocrManual"\)/);
  });

  it.each([
    ["src/components/field-staff/field-records-panel.tsx", "deliveryNoteNo"],
    ["src/components/contractor-ops/operations-workspaces.tsx", "deliveryNote"],
  ])("%s keeps a DO number typed while the read ran", (file, field) => {
    const source = read(file);
    expect(source).toContain(`ocr.noteTyped("${field}")`);
    expect(source).toContain(`typed.has("${field}")`);
  });

  it("a delivery submitted mid-read drops that read", () => {
    const source = read("src/components/field-staff/field-records-panel.tsx");
    expect(source).toMatch(/onSuccess: \(\) => \{[^}]*ocr\.cancel\(\);/);
    // Stopped when 提交 is pressed, not only once the delivery is in.
    expect(source).toMatch(/onMutate: \(\) => \{\s*if \(ocr\.reading\) ocr\.cancel\(\);/);
  });

  it.each([
    ["src/services/contractor.service.ts", "readDeliveryNote"],
    ["src/services/contractor-ops.service.ts", "ocrEquipmentDeliveryNote"],
  ])("%s lets the reader stop the photo upload", (file, name) => {
    const source = read(file);
    expect(source).toMatch(new RegExp(String.raw`function ${name}\([^)]*signal\?: AbortSignal`));
    expect(source).toMatch(/silent: true,\s*signal/);
  });
});
