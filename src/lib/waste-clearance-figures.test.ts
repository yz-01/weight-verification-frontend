/**
 * Audit #13 (F8): 垃圾清运's header figures describe the list under them.
 * JB248 (客户 11-23b 事项 1): 「两种业务的车次、重量及总数量分别累计，不混合统计」
 * - a line for 垃圾清运 and one for 废料处理, each read on its own kind with
 * the page's filters; 废料订单 is no longer on this page.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  clearanceFigureFilters,
  clearanceKindOf,
  clearanceTabHref,
  dispatchListHref,
} from "@/lib/waste-clearance-figures";

const params = (query: string) => new URLSearchParams(query);

describe("垃圾清运 header figures follow the list's filters, each kind apart", () => {
  it("drilled from 原工地清运 for one project: that project, counted only, per kind", () => {
    expect(clearanceFigureFilters(params("kind=disposal&counted=1&project=p1"))).toEqual({
      GARBAGE: { project: "p1", counted: "1", clearance_kind: "GARBAGE" },
      SCRAP: { project: "p1", counted: "1", clearance_kind: "SCRAP" },
    });
  });

  it("a status, company, dates or 异常记录 chosen on the list narrow both lines; a dispatch filter does not", () => {
    expect(
      clearanceFigureFilters(params("kind=garbage&status=COMPLETED&abnormal=1&state=SETTLED&page=2")).SCRAP,
    ).toEqual({ status: "COMPLETED", abnormal: "1", clearance_kind: "SCRAP" });
  });

  it("全部 with no filters counts everything of each kind", () => {
    expect(clearanceFigureFilters(params("kind=all"))).toEqual({
      GARBAGE: { clearance_kind: "GARBAGE" },
      SCRAP: { clearance_kind: "SCRAP" },
    });
  });

  it("is what the page reads its two lines with", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/contractor-ops/waste-clearance.tsx"),
      "utf8",
    );
    expect(source).toContain("clearanceFigureFilters(figureParams)");
    expect(source).toContain("getDisposalTotals(figureFilters.GARBAGE)");
    expect(source).toContain("getDisposalTotals(figureFilters.SCRAP)");
    // Never added together, and no 废料订单 here any more.
    expect(source).not.toContain("getDispatchSummary");
    expect(source).not.toContain("getDispatches");
  });
});

describe("垃圾清运's tabs: 全部｜垃圾清运｜废料处理 (JB248)", () => {
  it("reads the tab from the address; every older link opens 全部", () => {
    expect(clearanceKindOf("garbage")).toBe("garbage");
    expect(clearanceKindOf("scrap")).toBe("scrap");
    expect(clearanceKindOf("disposal")).toBe("all");
    expect(clearanceKindOf(null)).toBe("all");
  });

  it("each tab keeps the project, company and dates", () => {
    const from = params("kind=all&project=p1&supplier=s1&date_from=2026-11-01&status=APPROVED");
    expect(clearanceTabHref("scrap", from)).toBe("/waste-clearance?kind=scrap&project=p1&supplier=s1&date_from=2026-11-01");
    expect(clearanceTabHref("all", params("kind=scrap"))).toBe("/waste-clearance?kind=all");
  });

  it("an old 废料订单 link goes to 环保材料管理's 废料订单 with what it carried", () => {
    expect(dispatchListHref(params("kind=dispatch&counted=1&project=p1"))).toBe("/dispatches?counted=1&project=p1");
    expect(dispatchListHref(params("kind=dispatch"))).toBe("/dispatches");
  });

  it("the page offers the four tabs and lists the tab's kind", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/contractor-ops/waste-clearance.tsx"),
      "utf8",
    );
    expect(source).toContain('const TABS: readonly ClearanceTab[] = ["all", "garbage", "scrap", "abnormal"];');
    expect(source).toContain('<SiteDisposalOffice clearanceKind={kind === "all" ? undefined : CLEARANCE_KIND_OF[kind]} />');
    expect(source).toContain("<ClearanceStatsBar>");
  });
});
