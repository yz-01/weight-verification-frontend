import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every business record opens in the one record-detail popup (E8, Q31).
 *
 * Lucas, 2026-10-08, with the client's screenshot of the canvas's 记录详情:
 * 「所有业务模块的记录详情用同一个设计和排版…以弹窗显示…内容按模块不同，
 * 框架一样」, and 「手机端提交的记录都显示「记录人」」. The way this drifts
 * is one module quietly drawing its own detail again, so it is asserted by
 * source:
 *
 * * each business detail below renders `RecordDetailShell` inside
 *   `RecordDetailDialog` (or `RecordDetailFrame`, which is that dialog from
 *   inside the app and the same frame on its own page for a typed address),
 *   and the ones a phone submits fill 记录人 with `RecordRecorder`;
 * * any other component that looks like a record detail - named `…Detail…`,
 *   `…Sheet…` or `View…`, or drawing a page header with `DetailHeader` - is
 *   either one of those or on the allow-list below with the reason it is
 *   not a business record. A new detail fails here until it joins one.
 */
const ROOT = path.join(process.cwd(), "src", "components");

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

/** The body of one top-level component, up to the next top-level function. */
function componentBody(code: string, name: string) {
  const start = code.search(new RegExp(String.raw`\n(?:export )?function ${name}(?:<[^(]*>)?\(`));
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const rest = code.slice(start + 1);
  const next = rest.slice(1).search(/\n(?:export )?function [A-Z]/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** [file, component, whether a phone submits it (so it shows 记录人)]. */
const BUSINESS_DETAILS: Array<[string, string, boolean]> = [
  ["src/components/receipts/view-receipt.tsx", "ViewReceipt", true],
  ["src/components/contractor-ops/operations-workspaces.tsx", "OutgoingDetailDialog", true],
  ["src/components/contractor-ops/office-module-lists.tsx", "SiteEquipmentOffice", true],
  ["src/components/contractor-ops/office-module-lists.tsx", "SiteProgressOffice", true],
  ["src/components/contractor-ops/waste-outgoing-workspace.tsx", "WasteOutgoingWorkspace", true],
  ["src/components/contractor-ops/site-disposal-workspaces.tsx", "DisposalDetailDialog", true],
  ["src/components/sundry-claims/sundry-claims-office.tsx", "SundryClaimDetail", true],
  ["src/components/material-requests/material-requests-office.tsx", "MaterialRequestDetail", true],
  ["src/components/site-operations/safety.tsx", "HazardRecordDetail", true],
  ["src/components/site-access/gate-records.tsx", "GateIncidentDetailDialog", true],
  ["src/components/dashboard/field-task-sheet.tsx", "FieldTaskSheet", true],
  ["src/components/consultant-workflow/application-detail.tsx", "ConsultantApplicationDetail", true],
  ["src/components/incident-reporting/incident-thread-detail.tsx", "IncidentThreadDetail", true],
  ["src/components/equipment-hours/equipment-operator-hours.tsx", "DayDialog", true],
  ["src/components/contractor-ops/archive-queue.tsx", "RecordSheet", true],
  // The worker's own record on the phone: they are its recorder.
  ["src/components/field-staff/my-submissions.tsx", "StoredDetailSheet", false],
  // Made in the office, not on a phone: the popup, no 记录人.
  ["src/components/dispatches/view-dispatch.tsx", "ViewDispatch", false],
  ["src/components/tasks/view-task.tsx", "ViewTask", false],
  ["src/components/recycler-business/recycler-outbound-workspace.tsx", "ShipmentDetailDialog", false],
];

/**
 * Detail-looking components that are not a business record's detail, and
 * why. Admin and master data keep their own pages (E8 brief: 「Admin /
 * master-data views are not business records submitted from the phone」).
 */
const NOT_BUSINESS_RECORDS: Record<string, string> = {
  // Admin / master data: a company, a person, a role, a project, a machine of the fleet.
  "src/components/projects/view-project.tsx#ViewProject": "master data: a project",
  "src/components/users/view-user.tsx#ViewUser": "master data: a user account",
  "src/components/roles/view-role.tsx#ViewRole": "master data: a role",
  "src/components/companies/view-company.tsx#ViewCompany": "master data: a company",
  "src/components/settlements/view-settlement.tsx#ViewSettlement": "billing: a settlement statement",
  "src/components/weighing/view-weigh-session.tsx#ViewWeighSession": "recycler weighbridge session, an admin view (E8 brief)",
  "src/components/fleet/fleet-detail.tsx#DriverDetail": "master data: a driver",
  "src/components/fleet/fleet-detail.tsx#VehicleDetail": "master data: a vehicle",
  "src/components/site-access/site-access-workspace.tsx#PassDetail": "master data: an access pass",
  "src/components/billing/invoice-list.tsx#InvoiceDetailView": "billing: an invoice",
  "src/components/notifications/admin-notification-workspace.tsx#NotificationDetails": "admin: a notification",
  "src/components/consultant-workflow/application-template-workspace.tsx#TemplateDetailsDialog": "settings: an application template",
  // Office documents and their approval, not records a phone submits.
  "src/components/document-workflow/documents.tsx#DocumentDetailDialog": "document archive: a filed document",
  "src/components/document-workflow/documents.tsx#DocumentDetailBody": "document archive: a filed document",
  "src/components/document-workflow/approvals.tsx#ApprovalDetailDialog": "document approval workflow",
  "src/components/document-workflow/approvals.tsx#ApprovalDetailBody": "document approval workflow",
  // Aggregates of many records, built in the office.
  "src/components/contractor-ops/multi-engine.tsx#PackageSheet": "an evidence package of many records",
  "src/components/contractor-ops/multi-engine.tsx#ReviewSheet": "a package review",
  "src/components/contractor-ops/claim-engine.tsx#ClaimSheet": "a period claim of many records",
  "src/components/progress/daily-reports.tsx#DailyReportView": "a daily report written in the office",
  // Not yet a record: waiting on the phone to be sent.
  "src/components/field-staff/my-submissions.tsx#QueuedDetailSheet": "an offline submission not yet sent",
  // Not a record at all.
  "src/components/progress/progress-page.tsx#PhotoViewSwitch": "a list's view switch",
  "src/components/progress/progress-summary.tsx#SummaryBlocksView": "a summary chart",
  "src/components/progress/progress-summary.tsx#BlockView": "a summary chart",
  "src/components/receipts/material-tabs.tsx#NetTotalsView": "a totals table",
};

/** Files allowed to use `DetailHeader` (a page's back bar): admin pages and forms. */
const DETAIL_HEADER_ALLOWED = new Set([
  "src/components/projects/view-project.tsx",
  "src/components/users/view-user.tsx",
  "src/components/roles/view-role.tsx",
  "src/components/companies/view-company.tsx",
  "src/components/settlements/view-settlement.tsx",
  "src/components/weighing/view-weigh-session.tsx",
  "src/components/fleet/fleet-detail.tsx",
  // Forms and settings pages, not record details.
  "src/components/consultant-workflow/application-form.tsx",
  "src/components/consultant-workflow/approval-credential.tsx",
  "src/components/consultant-workflow/consultant-access-management.tsx",
  "src/components/consultant-workflow/workflow-settings.tsx",
  "src/components/shared/form-shell.tsx",
  // The primitive itself.
  "src/components/shared/page-primitives.tsx",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".tsx") && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

const relative = (full: string) => path.relative(process.cwd(), full).split(path.sep).join("/");

describe("every business record's detail is the record popup (E8)", () => {
  for (const [file, component, phone] of BUSINESS_DETAILS) {
    it(`${component} in ${path.basename(file)}`, () => {
      const body = componentBody(read(file), component);
      expect(body, "draws the shared shell").toMatch(/<RecordDetailShell\b/);
      expect(body, "inside the record popup").toMatch(/<RecordDetail(?:Dialog|Frame)\b/);
      if (phone) {
        expect(body, "shows 记录人").toMatch(/recorder=\{[\s\S]{0,120}?<RecordRecorder record=\{/);
      }
    });
  }
});

describe("no other record detail draws its own layout (E8)", () => {
  const files = sourceFiles(ROOT).map(relative);
  const onShell = new Set(BUSINESS_DETAILS.map(([file, component]) => `${file}#${component}`));

  it("every component that looks like a record detail is on the shell or allowed, with a reason", () => {
    const unknown: string[] = [];
    for (const file of files) {
      if (file.startsWith("src/components/shared/record-detail-")) continue;
      const code = read(file);
      for (const match of code.matchAll(
        /\n(?:export )?function ((?:[A-Z]\w*(?:Detail|Sheet)\w*)|(?:View[A-Z]\w*))(?:<[^(]*>)?\(/g,
      )) {
        const key = `${file}#${match[1]}`;
        if (!onShell.has(key) && !(key in NOT_BUSINESS_RECORDS)) unknown.push(key);
      }
    }
    expect(unknown, "add it to BUSINESS_DETAILS (on the shell) or NOT_BUSINESS_RECORDS (with why)").toEqual([]);
  });

  it("only admin views still draw a page header of their own", () => {
    const offenders = files.filter(
      (file) => !DETAIL_HEADER_ALLOWED.has(file) && /<DetailHeader\b/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("the allow-list holds only components that exist", () => {
    for (const key of Object.keys(NOT_BUSINESS_RECORDS)) {
      const [file, component] = key.split("#");
      componentBody(read(file), component);
    }
  });
});
