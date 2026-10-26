import { describe, expect, it } from "vitest";

import type {
  ContractorReportRecord,
  ContractorReportType,
} from "@/interfaces/contractor-report";
import {
  reportRowReference,
  reportRowRoute,
  reportRowTarget,
  reportValueKey,
} from "@/lib/report-preview";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

function entry(kind: string | null, extra: Partial<ContractorReportRecord> = {}): ContractorReportRecord {
  return {
    kind,
    id: "r1",
    project_id: "p1",
    user_id: null,
    date: null,
    cover_photo_url: null,
    photo_count: 0,
    ...extra,
  };
}

function lookup(catalogue: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    catalogue,
  );
}

describe("报表预览: where a row opens", () => {
  it.each([
    ["HAZARD", "/hazard-rectifications?incident=r1"],
    ["CONSULTANT_APPLICATION", "/consultant-applications/r1"],
    ["DISPOSAL", "/waste-clearance?kind=disposal&record=r1"],
    ["WASTE_DISPATCH", "/dispatches/r1"],
    ["EQUIPMENT_MOVEMENT", "/site-equipment?movement=r1"],
    ["DOCUMENT", "/documents?document=r1"],
    ["MATERIAL_RECEIPT", "/receipts/r1"],
  ])("opens %s on its module's page", (kind, href) => {
    expect(reportRowTarget(entry(kind))).toEqual({ href });
  });

  it("opens a progress record in the record sheet, checked against 工程进度", () => {
    const target = reportRowTarget(entry("PROGRESS"));
    expect(target).toEqual({ sheet: "PROGRESS", id: "r1" });
    expect(reportRowRoute(target)).toBe("/progress");
  });

  it("opens a clock-in as that person's day in 人员进场记录", () => {
    const target = reportRowTarget(
      entry("ATTENDANCE", { user_id: "u1", date: "2026-10-09" }),
    );
    expect(target).toEqual({
      href: "/attendance?date_from=2026-10-09&date_to=2026-10-09&user=u1&project=p1",
    });
    expect(reportRowRoute(target)).toBe("/attendance");
    expect(reportRowTarget(entry("ATTENDANCE"))).toBeNull();
  });

  it("leaves a row that is not one record unlinked", () => {
    expect(reportRowTarget(entry(null))).toBeNull();
    expect(reportRowTarget(null)).toBeNull();
    expect(reportRowTarget(entry("HAZARD", { id: null }))).toBeNull();
    expect(reportRowRoute(null)).toBeNull();
  });

  it("checks the page itself for a link", () => {
    expect(reportRowRoute({ href: "/dispatches/r1" })).toBe("/dispatches/r1");
    expect(reportRowRoute({ href: "/site-equipment?movement=r1" })).toBe("/site-equipment");
  });
});

describe("报表预览: a row's name", () => {
  it("is its reference number where it has one", () => {
    expect(reportRowReference({ project: "Tower", reference_no: "DR-001" })).toBe("DR-001");
    expect(reportRowReference({ project: "Tower", worker: "Ali" })).toBe("Ali");
    expect(reportRowReference({ project: "Tower" })).toBe("");
  });
});

describe("报表预览: no raw codes", () => {
  const cases: Array<[ContractorReportType, string, string | boolean, Record<string, string>]> = [
    ["recycling", "record_type", "DISPOSAL", {}],
    ["recycling", "record_type", "RECYCLE_ORDER", {}],
    ["recycling", "status", "COMPLETED", { record_type: "DISPOSAL" }],
    ["recycling", "status", "SETTLED", { record_type: "RECYCLE_ORDER" }],
    ["progress", "status", "CONFIRMED", {}],
    ["safety", "status", "VERIFIED", {}],
    ["safety", "status", "RETURNED", {}],
    ["consultant", "status", "APPROVED", {}],
    ["consultant", "final_decision", "REVISE_RESUBMIT", {}],
    ["attendance", "event", "CLOCK_IN", {}],
    ["attendance", "geofence_result", "NOT_EVALUATED", {}],
    ["attendance", "has_photo", true, {}],
    ["attendance", "has_photo", false, {}],
    ["equipment", "direction", "EXIT", {}],
    ["equipment", "ocr_status", "SUCCEEDED", {}],
    ["schedule", "status", "COMPLETED_LATE", {}],
    ["target", "status", "INACTIVE", {}],
    ["target", "target_type", "WEIGHT", {}],
    ["target", "period", "QUARTERLY", {}],
    ["documents", "status", "ARCHIVED", {}],
    ["photos", "category", "MATERIAL_RECEIPT", {}],
    ["photos", "origin", "ATTACHMENT", {}],
  ];

  it.each(cases)("%s · %s · %s is named in every language", (reportType, column, value, row) => {
    const key = reportValueKey(reportType, column, value, row);
    expect(key).toBeTruthy();
    for (const catalogue of [zh, en, ms, zhTW]) {
      expect(typeof lookup(catalogue, key ?? ""), key ?? "").toBe("string");
    }
  });

  // JB29: the server words a photo row's 业务分类 and 照片来源 itself; a code
  // is worded here, and nothing reads a table's name any more.
  it("shows the server's words for a photo row, and words a code", () => {
    expect(reportValueKey("photos", "category", "材料进场", {})).toBeNull();
    expect(reportValueKey("photos", "origin", "附件", {})).toBeNull();
    expect(reportValueKey("photos", "category", "WASTE", {})).toBe("contractorReports.photoCategory.WASTE");
    expect(reportValueKey("photos", "origin", "SITE", {})).toBe("contractorReports.photoOrigin.SITE");
  });

  it("leaves names, numbers and empty cells alone", () => {
    expect(reportValueKey("recycling", "counterparty", "Green Co", {})).toBeNull();
    expect(reportValueKey("recycling", "status", null, {})).toBeNull();
    expect(reportValueKey("schedule", "task", "Piling", {})).toBeNull();
  });
});
