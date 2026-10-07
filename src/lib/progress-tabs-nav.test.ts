/**
 * 2026-10 B17 (Q5, Q9, X7): what moving into the progress page's tabs did to
 * the menu and to the names.
 *
 * - 施工计划 left the left menu (Q9) but `/schedule` still opens: the page is
 *   kept, the tab is the way in.
 * - 「施工分类」 is one name: the progress page's tab, the field on the phone
 *   and in the lists, and the report menu's second level (D6) all say it.
 *   It was 施工阶段 on some screens and 施工分类 on others.
 * - The daily report tab is 「日报告」 and each report's name is 「日报名称」.
 */
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

import { isRouteAllowed, visibleNavigation } from "./navigation";

const FEATURES = ["progress", "schedule"];

function hrefs(features: string[]): string[] {
  return visibleNavigation("MSE_TRACE", features, []).flatMap((group) =>
    group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]),
  );
}

describe("施工计划 is a tab of 工程进度, not a menu entry (Q9)", () => {
  it("is not in the left menu", () => {
    expect(hrefs(FEATURES)).toContain("/progress");
    expect(hrefs(FEATURES)).not.toContain("/schedule");
  });

  it("still opens at /schedule for somebody with the schedule", () => {
    expect(isRouteAllowed("MSE_TRACE", FEATURES, "/schedule")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", ["progress"], "/schedule")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", FEATURES, "/progress")).toBe(true);
  });
});

describe("施工分类 has one name (Q5, X7)", () => {
  it.each([
    ["zh", zh],
    ["zh-TW", zhTW],
    ["en", en],
    ["ms", ms],
  ] as const)("in %s", (_locale, messages) => {
    const name = messages.progressPage.tabs.phases;
    expect(messages.progressPage.phases.name.toLowerCase()).toBe(
      messages.contractorOps.field.phase.toLowerCase(),
    );
    expect(messages.contractorOps.field.phase).toBe(messages.reportSelector.level.progress);
    expect(messages.contractorReports.column.phase).toBe(messages.contractorOps.field.phase);
    expect(name.toLowerCase()).toContain(messages.contractorOps.field.phase.toLowerCase().split(" ")[0]);
  });

  it("is 施工分类 in Chinese, and 施工阶段 is gone from the progress screens", () => {
    expect(zh.progressPage.tabs.phases).toBe("施工分类");
    expect(zh.contractorOps.field.phase).toBe("施工分类");
    expect(zhTW.contractorOps.field.phase).toBe("施工分類");
    const progressText = JSON.stringify([
      zh.contractorOps.progress,
      zh.contractorOps.field,
      zh.progressPage,
      zh.moduleTable.allPhases,
    ]);
    expect(progressText).not.toMatch(/阶段/);
    expect(
      JSON.stringify([zhTW.contractorOps.progress, zhTW.contractorOps.field, zhTW.progressPage]),
    ).not.toMatch(/階段/);
  });
});

describe("日报告 and 日报名称", () => {
  it("are the tab and the name of one report", () => {
    expect(zh.progressPage.tabs.reports).toBe("日报告");
    expect(zh.progressPage.reports.name).toBe("日报名称");
    expect(zh.progressPage.reports.date).toBe("日期");
    expect(zh.progressPage.reports.view).toBe("查看");
    expect(zhTW.progressPage.tabs.reports).toBe("日報告");
    expect(zhTW.progressPage.reports.name).toBe("日報名稱");
  });

  it("the page title is the menu's own name", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.progressPage.tabs.label).toBe(messages.nav.submodule.progressRecords);
    }
  });
});
