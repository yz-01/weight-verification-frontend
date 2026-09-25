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
  return readFileSync(path.join(process.cwd(), file), "utf8");
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

/** The nine office record details, the component that draws each, and its kind. */
const DETAILS: Array<[string, string, string]> = [
  ["src/components/receipts/view-receipt.tsx", "ViewReceipt", "MATERIAL_RECEIPT"],
  ["src/components/contractor-ops/operations-workspaces.tsx", "OutgoingDetailDialog", "MATERIAL_OUTGOING"],
  ["src/components/contractor-ops/office-module-lists.tsx", "SiteEquipmentOffice", "EQUIPMENT_MOVEMENT"],
  ["src/components/site-operations/safety.tsx", "Safety", "HAZARD"],
  ["src/components/contractor-ops/waste-outgoing-workspace.tsx", "WasteOutgoingWorkspace", "WASTE_OUTGOING"],
  ["src/components/contractor-ops/site-disposal-workspaces.tsx", "DisposalDetailDialog", "DISPOSAL_REQUEST"],
  ["src/components/contractor-ops/office-module-lists.tsx", "SiteProgressOffice", "PROGRESS"],
  ["src/components/consultant-workflow/application-detail.tsx", "ConsultantApplicationDetail", "CONSULTANT_APPLICATION"],
  ["src/components/sundry-claims/sundry-claims-office.tsx", "SundryClaimDetail", "SUNDRY_CLAIM"],
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

  it("renders the button inside the dialog header, after the title", () => {
    const header = dialog.slice(dialog.indexOf("<DialogHeader"), dialog.indexOf("</DialogHeader>"));
    expect(header).toMatch(/justify-between/);
    // Clear of the dialog's own close X in the corner.
    expect(header).toMatch(/pr-8/);
    expect(header.indexOf("<RecordExportButton")).toBeGreaterThan(header.indexOf("<DialogTitle>"));
  });
});

describe("the button and the endpoint (T-386)", () => {
  it("downloads one record from the record-exports endpoint, by kind and id", () => {
    const service = read("src/services/contractor-ops.service.ts");
    const fn = service.slice(service.indexOf("export const downloadRecordPdf"));
    expect(fn).toMatch(/download\("\/api\/record-exports\/download\/"/);
    expect(fn).toMatch(/query: \{ kind, record: recordId \}/);
  });

  it("draws nothing without an id, and cannot be pressed twice while it runs", () => {
    const button = read("src/components/shared/record-export-button.tsx");
    expect(button).toMatch(/if \(!recordId\) return null;/);
    expect(button).toMatch(/disabled=\{exporting\.isPending\}/);
    expect(button).toMatch(/t\("exportThisRecord"\)/);
  });

  it("is labelled in all four languages", () => {
    const expected: Record<string, string> = {
      en: "Export this record",
      zh: "单独导出",
      "zh-TW": "單獨匯出",
      ms: "Eksport rekod ini",
    };
    for (const [locale, text] of Object.entries(expected)) {
      const messages = JSON.parse(read(`src/messages/${locale}.json`));
      expect(messages.common.exportThisRecord, locale).toBe(text);
    }
  });
});
