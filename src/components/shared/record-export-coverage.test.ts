import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 「单独导出」 at the top right of every record detail (T-386, D-267, F-468).
 *
 * The customer, on the material-receipt detail: 「右上角可以加一个单独导出，
 * 每个模块都是一样可以单独导出…全部表单加上单独导出」. Asserted by source,
 * per detail component, because the way this drifts is one module quietly
 * not getting the button - and a detail without it looks complete.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

/** The body of one top-level component, up to the next top-level function. */
function componentBody(code: string, name: string) {
  // A generic component (`RecordSheet<K …>(`) counts as declared too.
  const start = code.search(new RegExp(String.raw`\n(?:export )?function ${name}(?:<[^(]*>)?\(`));
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const rest = code.slice(start + 1);
  const next = rest.slice(1).search(/\n(?:export )?function [A-Z]/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** Either the shell dialog's `exportRecord` prop or the button itself, for this kind. */
function passesExport(body: string, kind: string) {
  const viaDialog = new RegExp(
    String.raw`exportRecord=\{[\s\S]{0,60}?kind:\s*"${kind}",\s*recordId:\s*[\w.]+\.id\b`,
  );
  const viaButton = new RegExp(
    String.raw`<RecordExportButton\s+kind="${kind}"\s+recordId=\{[\w.]+\.id\}`,
  );
  return viaDialog.test(body) || viaButton.test(body);
}

/** The office record details, the component that draws each, and its kind. */
const DETAILS: Array<[string, string, string]> = [
  ["src/components/receipts/view-receipt.tsx", "ViewReceipt", "MATERIAL_RECEIPT"],
  ["src/components/contractor-ops/operations-workspaces.tsx", "OutgoingDetailDialog", "MATERIAL_OUTGOING"],
  ["src/components/contractor-ops/office-module-lists.tsx", "SiteEquipmentOffice", "EQUIPMENT_MOVEMENT"],
  ["src/components/site-operations/safety.tsx", "HazardRecordDetail", "HAZARD"],
  ["src/components/contractor-ops/waste-outgoing-workspace.tsx", "WasteOutgoingWorkspace", "WASTE_OUTGOING"],
  ["src/components/contractor-ops/site-disposal-workspaces.tsx", "DisposalDetailDialog", "DISPOSAL_REQUEST"],
  ["src/components/contractor-ops/office-module-lists.tsx", "SiteProgressOffice", "PROGRESS"],
  ["src/components/consultant-workflow/application-detail.tsx", "ConsultantApplicationDetail", "CONSULTANT_APPLICATION"],
  ["src/components/sundry-claims/sundry-claims-office.tsx", "SundryClaimDetail", "SUNDRY_CLAIM"],
  // 施工准证 is a HAZARD row (record_type PERMIT); its own detail exports the
  // complete evidence too (2026-10-10, 审批证据完整性).
  ["src/components/permits/permit-parts.tsx", "PermitDetail", "HAZARD"],
];

describe("every record detail can export that one record (T-386)", () => {
  for (const [file, component, kind] of DETAILS) {
    it(`${kind} in ${component}`, () => {
      const body = componentBody(read(file), component);
      expect(passesExport(body, kind), `${component} passes ${kind} to the export`).toBe(true);
    });
  }

  it("the equipment register (a machine, not a record kind) does not get one", () => {
    const body = componentBody(
      read("src/components/contractor-ops/office-module-lists.tsx"),
      "SiteEquipmentOffice",
    );
    expect(body.match(/exportRecord=/g) ?? []).toHaveLength(1);
  });

  it("the archive queue's sheet exports whichever kind it shows, except attendance", () => {
    const body = componentBody(read("src/components/contractor-ops/archive-queue.tsx"), "RecordSheet");
    // Gated on the nine the export endpoint prints (T-396): attendance, and a
    // column's delivery note, site record, machine, document or period claim,
    // get no button.
    expect(body).toMatch(/isExportableKind\(row\.kind\) && \(\s*<RecordExportButton\s+kind=\{row\.kind\}\s+recordId=\{row\.id\}/);
  });
});

describe("the shell puts it in the header, top right (T-386)", () => {
  const shell = read("src/components/shared/record-detail-shell.tsx");
  const dialog = componentBody(shell, "RecordDetailDialog");
  // One header for the popup and the page since E8: `RecordDetailHeading`.
  const header = componentBody(shell, "RecordDetailHeading");

  it("renders the button inside the dialog header, after the title", () => {
    expect(dialog).toMatch(/<RecordDetailHeading \{\.\.\.header\} inDialog \/>/);
    expect(header).toMatch(/justify-between/);
    // Clear of the dialog's own close X in the corner.
    expect(header).toMatch(/<DialogHeader className=\{cn\(frame, "pr-8"\)\}/);
    expect(header.indexOf("<RecordExportButton")).toBeGreaterThan(header.indexOf("<DialogTitle"));
  });
});

describe("the button and the endpoint (T-386)", () => {
  it("fetches one record's PDF from the record-exports endpoint, by kind and id", () => {
    const service = read("src/services/contractor-ops.service.ts");
    const fn = service.slice(service.indexOf("export const recordPdfFile"));
    expect(fn).toMatch(/fetchAsFile\("\/api\/record-exports\/download\/"/);
    expect(fn).toMatch(/query: \{ kind, record: recordId \}/);
  });

  it("draws nothing without an id, and offers the four shared file actions (PDF 统一操作规则)", () => {
    const button = read("src/components/shared/record-export-button.tsx");
    expect(button).toMatch(/if \(!recordId\) return null;/);
    expect(button).toMatch(/<FileActionButtons/);
    expect(button).toMatch(/load: \(\) => recordPdfFile\(kind, recordId, reference\)/);
    // Cannot be pressed twice while a file is being fetched.
    const actions = read("src/components/shared/file-actions.tsx");
    expect(actions).toMatch(/disabled=\{disabled \|\| Boolean\(busy\)\}/);
  });

  it("is labelled in all four languages", () => {
    const expected: Record<string, [string, string, string, string]> = {
      en: ["Preview", "Print", "Export", "Send"],
      zh: ["预览", "打印", "导出", "发送"],
      "zh-TW": ["預覽", "列印", "匯出", "發送"],
      ms: ["Pratonton", "Cetak", "Eksport", "Hantar"],
    };
    for (const [locale, words] of Object.entries(expected)) {
      const messages = JSON.parse(read(`src/messages/${locale}.json`));
      const { preview, print, save, share } = messages.fileActions;
      expect([preview, print, save, share], locale).toEqual(words);
    }
  });
});
