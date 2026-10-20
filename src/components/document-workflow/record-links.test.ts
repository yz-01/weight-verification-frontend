/**
 * Whole records in the document archive (J12-1..J12-5, J12-13, Q12-1..Q12-3):
 * a third way in beside the computer and system files; linked records shown
 * as they are today, with the gold 已修改, each printable, and all as one PDF.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LINKABLE_KINDS, recordKey } from "@/components/document-workflow/record-link-picker";
import zh from "@/messages/zh.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("whole records in a document", () => {
  it("are a third way in, in both the new and the add dialogs, the old two kept", () => {
    const page = read("src/components/document-workflow/documents.tsx");
    expect(page.match(/<TabsTrigger value="records">/g)).toHaveLength(2);
    expect(page.match(/<TabsTrigger value="system">/g)).toHaveLength(2);
    expect(page.match(/<TabsTrigger value="computer">/g)).toHaveLength(2);
    expect(page).toContain("addDocumentRecords({");
    expect(page).toContain("attachDocumentRecords(");
  });

  it("are found by number, material, specification, supplier, project and date", () => {
    const picker = read("src/components/document-workflow/record-link-picker.tsx");
    for (const key of ["search", "material", "specification", "supplier", "project", "date_from", "date_to"]) {
      expect(picker).toContain(`${key}`);
    }
    expect(LINKABLE_KINDS).toContain("MATERIAL_RECEIPT");
    expect(recordKey({ kind: "HAZARD", id: "1" })).toBe("HAZARD:1");
  });

  it("show the gold mark, print each record and all of them as one PDF", () => {
    const page = read("src/components/document-workflow/documents.tsx");
    expect(page).toContain("<CorrectedTag kind={link.kind as CorrectionHistoryKind} recordId={link.record_id} />");
    expect(page).toContain("documentRecordsPdf(document.id, document.document_no)");
    expect(page).toContain("<RecordExportButton");
    expect(zh.documents.recordLinks.gone).toBe("原记录已删除。");
  });
});
