/**
 * JB47 (客户 10-28): 「现场照片报表」 is gone from the report center - each
 * module's own records already carry their photographs. The menu no longer
 * offers it; an old link still opens (the route is allowed) and the page sends
 * it to the report center rather than an error.
 */
import { describe, expect, it, vi } from "vitest";

import { isRouteAllowed, navLeaves, visibleNavigation } from "@/lib/navigation";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const redirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});
const notFound = vi.fn(() => {
  throw new Error("notFound");
});
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/components/contractor-ops/contractor-report-workspace", () => ({
  ContractorReportWorkspace: () => null,
  ContractorReportHistoryWorkspace: () => null,
}));

const FEATURES = ["report_center", "material_quantity_report", "material_cost_report"];

describe("JB47: no photo report in the report center", () => {
  it("is not in the report menu", () => {
    const entry = visibleNavigation("MSE_TRACE", FEATURES, ["report.view"])
      .flatMap((group) => group.items)
      .find((item) => item.feature === "report_center");
    const hrefs = navLeaves(entry?.children).map((leaf) => leaf.href);
    expect(hrefs).not.toContain("/reports/contractor/photos");
    expect(hrefs).toContain("/reports/contractor/progress");
  });

  it("keeps the old address reachable, so it can be sent on", () => {
    expect(
      isRouteAllowed("MSE_TRACE", FEATURES, "/reports/contractor/photos", ["report.view"]),
    ).toBe(true);
  });

  it("sends the old address to the report center", async () => {
    const { default: Page } = await import(
      "@/app/(dashboard)/reports/contractor/[reportType]/page"
    );
    await expect(Page({ params: Promise.resolve({ reportType: "photos" }) })).rejects.toThrow(
      "redirect:/modules/reports",
    );
    expect(redirect).toHaveBeenCalledWith("/modules/reports");
    // Another report still opens.
    await expect(
      Page({ params: Promise.resolve({ reportType: "progress" }) }),
    ).resolves.toBeTruthy();
  });
});

describe("JB60: 项目资料报表 is 文件资料报表 (「因为他本来就是文件」)", () => {
  it("names the report and its menu row as documents, in all four languages", () => {
    const want = {
      zh: ["文件资料", "文件资料报表"],
      "zh-TW": ["文件資料", "文件資料報表"],
      en: ["Document records", "Document records report"],
      ms: ["Rekod dokumen", "Laporan rekod dokumen"],
    } as const;
    for (const [messages, locale] of [[zh, "zh"], [zhTW, "zh-TW"], [en, "en"], [ms, "ms"]] as const) {
      expect(messages.nav.submodule.documentRecords).toBe(want[locale][0]);
      expect(messages.contractorReports.type.documents).toBe(want[locale][1]);
    }
    // 项目 (the projects module) keeps its own name.
    expect(zh.nav.submodule.projectRecords).toBe("项目资料");
  });

  it("is the menu row of the same address", () => {
    const entry = visibleNavigation("MSE_TRACE", FEATURES, ["report.view", "document.view"])
      .flatMap((group) => group.items)
      .find((item) => item.feature === "report_center");
    const leaf = navLeaves(entry?.children).find((row) => row.href === "/reports/contractor/documents");
    expect(leaf?.labelKey).toBe("nav.submodule.documentRecords");
  });
});
