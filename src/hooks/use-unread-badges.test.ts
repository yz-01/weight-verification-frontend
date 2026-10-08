/**
 * What a sidebar badge counts, and what it says it counts.
 *
 * Lucas (2026-10-09): 「只有待验收的才需要加进去号码」. No badge counts a
 * 【确认】 any more - 材料进场's number is its deliveries 待验收 - so none
 * says 待确认: an approval or acceptance (待审批/验收), or for 隐患整改 the
 * hazards this reader moves on next (等你处理). Never 未读.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BADGE_FEATURES,
  BADGE_PERMISSIONS,
  badgeFor,
  badgeLabelKey,
  menuWaiting,
} from "@/hooks/use-unread-badges";
import {
  PORTAL_NAVIGATION,
  badgeKeysFor,
  navLeaves,
  visibleNavigation,
  type FeatureNavItem,
} from "@/lib/navigation";

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));

describe("every sidebar badge says what it counts (2026-10-09)", () => {
  it("names every approval / acceptance badge 待审批/验收, and 隐患整改's 等你处理", () => {
    for (const feature of ["material_receipts", "material_requests", "equipment", "documents", "recyclers"] as const) {
      expect(badgeLabelKey(feature), feature).toBe("nav.waitingApproval");
    }
    expect(badgeLabelKey("hazard_rectification")).toBe("nav.waitingForYou");
  });

  it.each([
    ["zh", /待审批\/验收/],
    ["zh-TW", /待審批\/驗收/],
    ["en", /approval or acceptance/i],
    ["ms", /kelulusan atau penerimaan/i],
  ])("%s says approval or acceptance, not confirm, not unread", (locale, pattern) => {
    const nav = messages(locale).nav;
    const text = nav.waitingApproval as string;
    expect(text).toMatch(pattern);
    expect(text).toContain("{count}");
    expect(text).not.toMatch(/未读|未讀|unread|belum dibaca|待确认|待確認|confirmation|pengesahan/i);
    // No badge counts a 【确认】 any more, so the 待确认 wording is gone.
    expect(nav.waitingConfirm).toBeUndefined();
  });

  it("has no number for 进度, which has no approval step", () => {
    expect(BADGE_FEATURES).not.toContain("progress");
    expect(BADGE_PERMISSIONS).not.toContain("progress.view");
  });

  it("puts that label on the badge as its name and its tooltip", () => {
    const layout = (file: string) =>
      readFileSync(path.join(process.cwd(), "src", "components", "layout", file), "utf8");
    // One pill for the entry and every row of its menus (2026-10-09).
    const flyout = layout("sidebar-flyout.tsx");
    expect(flyout).toMatch(/const name = t\(badgeLabelKey\(feature\), \{ count \}\);/);
    expect(flyout).toMatch(/aria-label=\{name\}/);
    expect(flyout).toMatch(/title=\{name\}/);
    const sidebar = layout("app-sidebar.tsx");
    expect(sidebar).toMatch(/<WaitingBadge\s+count=\{waiting\}\s+feature=\{item\.feature\}/);
    for (const source of [flyout, sidebar]) {
      expect(source).not.toMatch(/t\("nav\.waitingForYou"/);
      expect(source).not.toContain("waitingUnknown");
    }
  });

  it.each(["zh", "zh-TW", "en", "ms"])("%s: the dashboard's stale-data note no longer says unread", (locale) => {
    expect(messages(locale).contractorDashboard.liveStopped).not.toMatch(/未读|未讀|unread|belum dibaca/i);
  });
});

describe("one number per entry, from the counts of its pages (2026-10-08)", () => {
  it("adds the pages up", () => {
    expect(
      badgeFor({ material_receipts: 2, material_outgoing: 4 }, ["material_receipts", "material_outgoing"]),
    ).toBe(6);
    expect(badgeFor({ equipment: 5 }, ["equipment"])).toBe(5);
  });

  it("is zero when nothing is waiting, and zero when the counts never loaded (2026-10-09)", () => {
    // 「如果是0的话就不用显示」: no "?" state - an unloaded count and an empty
    // pile both leave the entry without a badge.
    expect(badgeFor({ equipment: 0 }, ["equipment"])).toBe(0);
    expect(badgeFor({}, ["progress", "schedule"])).toBe(0);
    expect(badgeFor({}, ["material_receipts", "material_outgoing"])).toBe(0);
  });

  it("returns no unknown state when the request fails, and keeps the last counts on a failed refresh", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "hooks", "use-unread-badges.ts"), "utf8");
    expect(source).toMatch(/return query\.data\?\.badges \?\? \{\};/);
    expect(source).not.toMatch(/isError/);
    expect(source).not.toMatch(/, null\]/);
  });

  it("reads one endpoint for every module, asks again on focus, keeps no timer of its own", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "hooks", "use-unread-badges.ts"), "utf8");
    expect(source).toContain("getSidebarBadges(");
    // The shell's live stream and the app-wide safety poll refresh it; a
    // second interval on every page of every office user is what not to add.
    expect(source).not.toMatch(/refetchInterval/);
    expect(source).toMatch(/staleTime: BADGE_STALE_MS/);
    expect(source).toMatch(/refetchOnWindowFocus: true/);
    // The top bar's current project (B13), as every list sends it.
    expect(source).toMatch(/current\.active \? current\.projectId : ""/);
    expect(source).toMatch(/queryKey: \["sidebar-badges", project\]/);
    expect(source).not.toContain("getContractorDashboard(");
    const service = readFileSync(
      path.join(process.cwd(), "src", "services", "contractor-dashboard.service.ts"),
      "utf8",
    );
    expect(service).toContain("/api/contractor-dashboard/get_badges/");
  });

  it("asks only when the reader holds a permission the endpoint opens for", () => {
    // Mirrors `contractor_ops.sidebar_badges.BADGE_PERMISSIONS` (the backend
    // test reads this list): the view permission of each counted list, and
    // nothing else - a button without its list gives no number.
    expect(BADGE_PERMISSIONS).toContain("receipt.view");
    expect(BADGE_PERMISSIONS).toContain("equipment.view");
    expect(BADGE_PERMISSIONS.every((code) => code.endsWith(".view"))).toBe(true);
    expect(BADGE_PERMISSIONS).not.toContain("dashboard.view");
    const source = readFileSync(path.join(process.cwd(), "src", "hooks", "use-unread-badges.ts"), "utf8");
    // A consultant shares the portal but not the contractor's office counts.
    expect(source).toMatch(/user\.account_type === "TENANT"/);
  });
});

describe("each row of an entry's menu shows its own number (2026-10-09)", () => {
  // 「hover的时候如果有事项也会看到号码在哪个分类，全部业务模块都是一样这个逻辑」
  const entries = (): FeatureNavItem[] => {
    const features = new Set<string>();
    for (const item of PORTAL_NAVIGATION.MSE_TRACE) {
      features.add(item.feature);
      for (const leaf of navLeaves(item.children)) {
        if (leaf.feature) features.add(leaf.feature);
        for (const key of leaf.anyFeatures ?? []) features.add(key);
      }
    }
    return visibleNavigation("MSE_TRACE", [...features], [], true).flatMap((group) => group.items);
  };
  const entry = (labelKey: string) => {
    const found = entries().find((item) => item.labelKey === labelKey);
    expect(found, labelKey).toBeDefined();
    return found!;
  };

  it("puts each page's count on its own row", () => {
    const waiting = menuWaiting(entry("materialManagement"), {
      material_receipts: 2,
      material_outgoing: 4,
    });
    // 材料进场 2, 材料出场 4; the entry shows 6.
    expect(waiting).toEqual({ "5.2.1": 2, "5.2.2": 4 });
    // Nothing waiting on a page: zero, which shows no badge.
    expect(menuWaiting(entry("materialManagement"), { material_outgoing: 3 })["5.2.1"]).toBe(0);
  });

  it("shows a pile shared by two pages once, on the first page", () => {
    // 设备's two pages are both `equipment`; the movements are 现场设备's list.
    expect(menuWaiting(entry("equipment"), { equipment: 5 })).toEqual({ "6.2.1": 5, "6.2.2": 0 });
  });

  it("gives a heading the sum of the pages under it, and each page its own", () => {
    // 报表中心 → 物料报表 opens 物料数量 and 物料成本.
    const waiting = menuWaiting(entry("report_center"), {
      material_quantity_report: 2,
      material_cost_report: 3,
    });
    expect(waiting["13.2.M"]).toBe(5);
    expect(waiting["13.2.1"]).toBe(2);
    expect(waiting["13.2.2"]).toBe(3);
  });

  it("keeps an entry's own count to itself: 顾问 does not show 文件's approvals", () => {
    const waiting = menuWaiting(entry("consultant_applications"), {
      consultant_applications: 1,
      approvals: 9,
    });
    expect(Object.values(waiting).reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it("adds every entry's rows up to the entry's own number", () => {
    const counts = Object.fromEntries(BADGE_FEATURES.map((key, index) => [key, index + 1]));
    for (const item of entries()) {
      if (!item.children?.length) continue;
      const waiting = menuWaiting(item, counts);
      // Top-level rows only: a heading already holds its pages' sum.
      const rows = item.children.reduce((sum, child) => sum + (waiting[child.key] ?? 0), 0);
      expect(rows, item.labelKey).toBe(badgeFor(counts, badgeKeysFor(item)));
    }
  });
});
