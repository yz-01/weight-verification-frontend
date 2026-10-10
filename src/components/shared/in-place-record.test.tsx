/**
 * Lucas, 2026-10-10 (图8 → 图9): 「点那个卡片的时候就会显示完整的…资料，然后
 * 关掉还是会保留在刚刚的页面，不会跳转，其他业务模块也是一样」.
 *
 * A record pressed in a report preview, a dashboard card or row, or a badge's
 * popup opens its module's own record popup over the page, for every kind
 * whose popup stands on its own; the others still open on their module's
 * screen. Rendered to static markup (the runner has no DOM) with each module
 * popup stubbed, so what is checked is which popup a kind gets.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/components/receipts/view-receipt", () => ({
  ViewReceipt: ({ id, presentation }: { id: string; presentation: string }) => (
    <div data-stub="receipt" data-id={id} data-presentation={presentation} />
  ),
}));
vi.mock("@/components/dashboard/approval-opener", () => ({
  OutgoingDecision: ({ id }: { id: string }) => <div data-stub="outgoing" data-id={id} />,
}));
vi.mock("@/components/material-requests/material-requests-office", () => ({
  MaterialRequestDetail: ({ id }: { id: string }) => <div data-stub="material-request" data-id={id} />,
}));
vi.mock("@/components/sundry-claims/sundry-claims-office", () => ({
  SundryClaimDetail: ({ id }: { id: string }) => <div data-stub="sundry-claim" data-id={id} />,
}));
vi.mock("@/components/consultant-workflow/application-detail", () => ({
  ConsultantApplicationDetail: ({ id, presentation }: { id: string; presentation: string }) => (
    <div data-stub="consultant" data-id={id} data-presentation={presentation} />
  ),
}));
vi.mock("@/components/dashboard/field-task-sheet", () => ({
  FieldTaskSheet: ({ id }: { id: string }) => <div data-stub="field-task" data-id={id} />,
}));

const { InPlaceRecord, opensInPlace } = await import("@/components/shared/in-place-record");
const { recordTarget } = await import("@/lib/record-routes");

const IN_PLACE: Array<[string, string]> = [
  ["MATERIAL_RECEIPT", "receipt"],
  ["MATERIAL_OUTGOING", "outgoing"],
  ["MATERIAL_REQUEST", "material-request"],
  ["SUNDRY_CLAIM", "sundry-claim"],
  ["CONSULTANT_APPLICATION", "consultant"],
  ["FIELD_TASK", "field-task"],
];

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "src", file), "utf8").replace(/\r\n/g, "\n");

describe("a record opens over the page it was pressed on", () => {
  it("gives each kind with a stand-alone popup that popup, with the record's id", () => {
    for (const [kind, stub] of IN_PLACE) {
      expect(opensInPlace(kind), kind).toBe(true);
      const html = renderToStaticMarkup(<InPlaceRecord kind={kind} id="r-9" onClose={() => {}} />);
      expect(html, kind).toContain(`data-stub="${stub}"`);
      expect(html, kind).toContain('data-id="r-9"');
    }
  });

  it("draws a delivery and a consultant application as popups, not as their pages", () => {
    for (const kind of ["MATERIAL_RECEIPT", "CONSULTANT_APPLICATION"]) {
      const html = renderToStaticMarkup(<InPlaceRecord kind={kind} id="r-1" onClose={() => {}} />);
      expect(html, kind).toContain('data-presentation="dialog"');
    }
  });

  it("leaves the kinds whose popup lives inside their list to their module's screen", () => {
    for (const kind of ["WASTE_OUTGOING", "DISPOSAL_REQUEST", "HAZARD", "WASTE_DISPATCH", "GATE_INCIDENT", "", null]) {
      expect(opensInPlace(kind), String(kind)).toBe(false);
    }
    expect(renderToStaticMarkup(<InPlaceRecord kind="HAZARD" id="h-1" onClose={() => {}} />)).toBe("");
  });

  it("covers only kinds the shared record route already opens", () => {
    for (const [kind] of IN_PLACE) {
      const target = recordTarget(kind, "x");
      expect(target && "href" in target, kind).toBe(true);
    }
  });
});

describe("the callers open in place instead of leaving the page", () => {
  it("the shared opener (dashboard cards, 等你处理, photos, documents, the timeline) asks first", () => {
    const opener = read("components/shared/record-opener.tsx");
    expect(opener).toMatch(
      /if \(id && opensInPlace\(kind\)\) \{\s+setInPlace\(\{ kind, id \}\);\s+return true;\s+\}\s+router\.push\(target\.href\);/,
    );
    expect(opener).toMatch(/<InPlaceRecord kind=\{inPlace\.kind\} id=\{inPlace\.id\} onClose=\{closeInPlace\} \/>/);
  });

  it("a report preview row goes through the opener for those kinds", () => {
    const report = read("components/contractor-ops/contractor-report-workspace.tsx");
    expect(report).toMatch(/if \("href" in target && !opensInPlace\(record\?\.kind\)\) \{\s+router\.push\(target\.href\);/);
  });

  it("the dashboard's activity feed and timeline open those kinds in place", () => {
    const dashboard = read("components/dashboard/contractor-dashboard.tsx");
    expect(dashboard).toMatch(/row\.id && opensInPlace\(row\.kind\) \?[\s\S]{0,400}opener\.open\(row\.kind, row\.id,/);
    expect(dashboard).toMatch(/target && "href" in target && !\(id && opensInPlace\(entry\.kind\)\)/);
  });

  it("the material quantity report opens a delivery in its popup, not on its page", () => {
    const report = read("components/reports/material-report.tsx");
    expect(report).not.toContain("href={`/receipts/${row.id}`}");
    expect(report).toMatch(/<ViewReceipt id=\{opened\} presentation="dialog" onClose=\{\(\) => setOpened\(null\)\} \/>/);
  });
});
