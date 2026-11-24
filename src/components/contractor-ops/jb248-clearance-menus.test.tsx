/**
 * JB248 (客户 11-23b 事项 1) and JB249 (事项 2) on screen.
 *
 * > 后台工地清运菜单：统一名称为「垃圾清运」，后台及手机端名称保持一致。「垃圾清运」
 * > 与「废料处理」名称为归属同一个业务菜单。菜单内分为：全部｜垃圾清运｜废料处理。
 * > 手机端：原「垃圾清运」，增设独立「废料处理」按钮。
 * > 环保材料管理：作为另一个独立业务菜单。现有「废料订单」…归回环保材料管理。
 * > 在现有车次及重量统计栏的最右边，预留一个「ESG 统计」按钮位置…暂时不需要开发
 * > ESG 页面、计算功能或点击操作。
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ClearanceStatsBar, EsgStatsSlot } from "@/components/contractor-ops/clearance-stats-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { isRouteAllowed, visibleNavigation } from "@/lib/navigation";

const read = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8");

const FEATURES = ["dashboard", "recyclers", "site_disposals", "waste_outgoing", "waste_dispatches"];

function entries() {
  return visibleNavigation("MSE_TRACE", FEATURES).flatMap((group) => group.items);
}

describe("JB248 menus: 垃圾清运 on its own, 废料订单 back in 环保材料管理", () => {
  it("垃圾清运 is a business menu of its own, opening the page with the three tabs", () => {
    const own = entries().find((entry) => entry.feature === "site_disposals");
    expect(own?.href).toBe("/waste-clearance");
    expect(own?.labelKey).toBe("site_disposals");
    expect(zh.nav.site_disposals).toBe("垃圾清运");
    // The old address still opens.
    expect(isRouteAllowed("MSE_TRACE", FEATURES, "/site-disposals")).toBe(true);
  });

  it("环保材料管理 lists 废料订单 again and no longer holds 垃圾清运", () => {
    const recycling = entries().find((entry) => entry.feature === "recyclers");
    const hrefs = (recycling?.children ?? []).map((child) => child.href);
    expect(hrefs).toContain("/dispatches");
    expect(hrefs).not.toContain("/waste-clearance");
  });

  it("without 垃圾清运 the menu has no 垃圾清运 entry and the page is closed", () => {
    const without = FEATURES.filter((key) => key !== "site_disposals");
    expect(
      visibleNavigation("MSE_TRACE", without).flatMap((group) => group.items).some((entry) => entry.feature === "site_disposals"),
    ).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", without, "/waste-clearance")).toBe(false);
  });

  it("the old 废料订单 tab links go to 环保材料管理", () => {
    for (const file of [
      "lib/activity-href.ts",
      "lib/headquarters-links.ts",
      "components/dashboard/dashboard.tsx",
      "components/dispatches/view-dispatch.tsx",
      "components/projects/view-project.tsx",
      "components/dashboard/headquarters-figures.tsx",
    ]) {
      expect(read(file), file).not.toContain("kind=dispatch");
    }
    expect(read("app/(dashboard)/dispatches/page.tsx")).toContain("<ContractorWasteOrders />");
  });
});

describe("JB248 phone: 「垃圾清运」 and a separate 「废料处理」 button, same flow", () => {
  const panel = read("components/field-staff/field-records-panel.tsx");

  it("has the 废料处理 button with 垃圾清运's permission", () => {
    expect(panel).toContain('{ key: "scrap", permission: "disposal.submit"');
    expect(zh.fieldStaffPwa.records.scrap).toBe("废料处理");
    expect(zh.fieldStaffPwa.records.disposal).toBe("垃圾清运");
  });

  it("opens 垃圾清运's own screen, filing 废料处理", () => {
    expect(panel).toContain('clearanceKind="SCRAP"');
    expect(panel).toContain('clearanceKind="GARBAGE"');
    const workspace = read("components/contractor-ops/site-disposal-workspaces.tsx");
    expect(workspace).toContain("clearance_kind: clearanceKind");
    expect(workspace).toContain("clearance_kind: kind,");
  });
});

describe("JB248 words: one name, every language", () => {
  it("「工地清运」 is 「垃圾清运」 everywhere in Chinese", () => {
    expect(JSON.stringify(zh)).not.toContain("工地清运");
    expect(JSON.stringify(zhTW)).not.toContain("工地清運");
  });

  it("the new words are in all four files", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb248.kind.GARBAGE).toBeTruthy();
      expect(messages.jb248.kind.SCRAP).toBeTruthy();
      expect(messages.jb248.tab.scrap).toBeTruthy();
      expect(messages.jb248.totals.SCRAP).toContain("{trips}");
      expect(messages.jb249.button).toBeTruthy();
      expect(messages.jb249.soon).toBeTruthy();
      expect(messages.fieldStaffPwa.records.scrap).toBeTruthy();
    }
    expect(zh.jb248.tab).toEqual({ all: "全部", garbage: "垃圾清运", scrap: "废料处理", abnormal: "异常记录" });
  });
});

describe("JB249 「ESG 统计」: the place only", () => {
  const render = (node: React.ReactNode) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>,
    );

  it("is a greyed-out button that says 「即将推出」 and does nothing", () => {
    const html = render(<EsgStatsSlot />);
    expect(html).toContain("ESG 统计");
    expect(html).toContain("即将推出");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).not.toContain("href=");
  });

  it("sits at the right end of the statistics bar, after the lines", () => {
    const html = render(
      <ClearanceStatsBar>
        <p>垃圾清运：1 笔</p>
      </ClearanceStatsBar>,
    );
    expect(html.indexOf("垃圾清运：1 笔")).toBeLessThan(html.indexOf("ESG 统计"));
    expect(html).toContain("justify-between");
  });

  it("is on 垃圾清运 and on 废料订单 in 环保材料管理", () => {
    expect(read("components/contractor-ops/waste-clearance.tsx")).toContain("<ClearanceStatsBar>");
    expect(read("components/dispatches/contractor-waste-orders.tsx")).toContain("<ClearanceStatsBar>");
  });
});
