/**
 * Three checklist rows the spec audit found short (2026-10-22):
 * J8-3 the whole record under the photo, J12-6 the inspection form at upload,
 * J34-3 the equipment-hours list drawing its photographs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8").replace(/\r\n/g, "\n");

describe("checklist rows made whole", () => {
  it("J8-3: the photo report's viewer shows the record's fields under the photo", () => {
    const report = read("components/reports/photo-groups-report.tsx");
    expect(report).toMatch(/details=\{\s*group\.kind && group\.record_id && sheetKindOf\(group\.kind\) \? \(\s*<RecordFacts/);
    expect(report).toMatch(/getCategoryRecord\(sheet!, id\)/);
    expect(read("components/shared/record-detail-shell.tsx")).toMatch(/data-photo-viewer-details/);
  });

  it("J12-6: uploading into a subcategory that needs inspection opens the inspection form", () => {
    const documents = read("components/document-workflow/documents.tsx");
    expect(documents).toMatch(/needsInspection && canDo\("inspection\.record"\) && documentId/);
    expect(documents).toMatch(/<InspectionDialog\s+documentId=\{inspecting\}/);
  });

  it("J34-3: the equipment-hours list draws each row's photographs", () => {
    const hours = read("components/equipment-hours/equipment-operator-hours.tsx");
    expect(hours).toMatch(/<PhotoStrip\s+thumbs=\{row\.photo_thumbs\}/);
  });
});
