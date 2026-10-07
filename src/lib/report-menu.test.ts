/**
 * D6 (Q16, Q17): what sits under each report in 【选择报表】, and where a
 * pick at any level leads. B12 / X15: the toolbar's page switcher stays off
 * the pages that carry the menu.
 */
import { describe, expect, it } from "vitest";

import type { ReportLevelRow } from "@/interfaces/contractor-report";
import { navLeaves, visibleNavigation } from "@/lib/navigation";
import {
  groupPhotoSources,
  isReportCenterPage,
  levelRowName,
  reportHref,
  reportMenuKind,
} from "@/lib/report-menu";

function reportLeaves(permissions: string[]) {
  const entry = visibleNavigation(
    "MSE_TRACE",
    ["report_center", "material_quantity_report", "material_cost_report"],
    permissions,
  )
    .flatMap((group) => group.items)
    .find((item) => item.feature === "report_center");
  return navLeaves(entry?.children);
}

describe("the report menu's levels (D6 table)", () => {
  it("gives every report the level the spec lists, and the rest none", () => {
    const levels = Object.fromEntries(
      reportLeaves(["report.view", "document.view"]).map((leaf) => {
        const kind = reportMenuKind(leaf.href);
        return [
          leaf.href,
          kind.kind === "categories"
            ? [kind.label, kind.childLabel ?? null]
            : kind.kind,
        ];
      }),
    );
    expect(levels).toEqual({
      "/reports/material-quantity": "material",
      "/reports/material-cost": "material",
      "/reports/contractor/photos": ["reportSelector.level.photos", null],
      "/reports/contractor/progress": ["reportSelector.level.progress", null],
      "/reports/contractor/safety": ["reportSelector.level.safety", null],
      "/reports/contractor/consultant": ["reportSelector.level.consultant", null],
      "/reports/contractor/attendance": "none",
      "/reports/contractor/equipment": [
        "reportSelector.level.equipment",
        "reportSelector.level.equipmentClass",
      ],
      "/reports/contractor/recycling": ["reportSelector.level.recycling", null],
      "/reports/contractor/schedule": "none",
      "/reports/contractor/documents": [
        "reportSelector.level.documents",
        "reportSelector.level.documentSubcategory",
      ],
      "/reports/contractor/target": "none",
      "/reports/contractor/history": "none",
    });
  });

  it("opens 项目资料 at the document archive, only for its readers", () => {
    const withArchive = reportLeaves(["report.view", "document.view"]);
    const project = withArchive.find((leaf) => leaf.labelKey === "nav.submodule.projectRecords");
    expect(project?.href).toBe("/reports/contractor/documents");
    expect(withArchive.map((leaf) => leaf.href)).toContain("/reports/contractor/target");

    const without = reportLeaves(["report.view"]).map((leaf) => leaf.href);
    expect(without).not.toContain("/reports/contractor/documents");
    expect(without).toContain("/reports/contractor/target");
  });
});

describe("where a pick leads", () => {
  const here = new URLSearchParams(
    "project=p1&date_from=2026-10-01&date_to=2026-10-07&category=old&supplier=s0&page=3",
  );

  it("keeps the reader's project and dates and sets exactly the level picked", () => {
    expect(reportHref("/reports/contractor/progress", {}, here)).toBe(
      "/reports/contractor/progress?project=p1&date_from=2026-10-01&date_to=2026-10-07",
    );
    expect(
      reportHref(
        "/reports/contractor/equipment",
        { category: "major", subcategory: "minor" },
        here,
      ),
    ).toBe(
      "/reports/contractor/equipment?project=p1&date_from=2026-10-01&date_to=2026-10-07&category=major&subcategory=minor",
    );
    expect(
      reportHref("/reports/material-quantity", { category: "c1", supplier: "s1" }, new URLSearchParams()),
    ).toBe("/reports/material-quantity?category=c1&supplier=s1");
  });
});

describe("the page switcher stays off report pages (X15)", () => {
  it("knows the pages that carry 【选择报表】", () => {
    expect(isReportCenterPage("/reports/material-quantity")).toBe(true);
    expect(isReportCenterPage("/reports/material-cost")).toBe(true);
    expect(isReportCenterPage("/reports/contractor/documents")).toBe(true);
    expect(isReportCenterPage("/reports/contractor/history")).toBe(true);
    expect(isReportCenterPage("/receipts")).toBe(false);
    expect(isReportCenterPage("/reports/search")).toBe(false);
  });
});

function row(value: string, label: string, project_code = ""): ReportLevelRow {
  return { value, label, project_code, has_children: false };
}

describe("rows as the menu names them", () => {
  it("lists a module's photographs once, under the module's own name", () => {
    const names: Record<string, string> = {
      "nav.submodule.progressRecords": "工程进度",
      "nav.submodule.materialReceipts": "材料进场",
    };
    const grouped = groupPhotoSources(
      [
        row("contractor_ops.siteprogressphoto", "Progress"),
        row("receiving.receiptphoto", "Material"),
        row("site_operations.progressupdate", "Progress"),
        row("haulage.taskphoto", "Driver task"),
      ],
      (key) => names[key] ?? key,
    );
    expect(grouped.map((entry) => [entry.label, entry.value])).toEqual([
      ["工程进度", "contractor_ops.siteprogressphoto,site_operations.progressupdate"],
      ["材料进场", "receiving.receiptphoto"],
      ["Driver task", "haulage.taskphoto"],
    ]);
  });

  it("names the project beside a name two projects share, only with no project chosen", () => {
    const rows = [row("a", "打桩", "P1"), row("b", "打桩", "P2"), row("c", "屋顶", "P1")];
    expect(rows.map((entry) => levelRowName(entry, rows, false))).toEqual([
      "打桩 · P1",
      "打桩 · P2",
      "屋顶",
    ]);
    expect(levelRowName(rows[0], rows, true)).toBe("打桩");
  });
});
