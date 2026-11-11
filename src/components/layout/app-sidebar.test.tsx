/**
 * The restyled menu lists exactly what the menu listed before (UI phase,
 * Lucas 2026-10-08).
 *
 * The design canvas draws a rail with five sample modules; the real sidebar
 * keeps every module, every child entry, the permission filter, the order and
 * the waiting counts. The list itself comes from `visibleNavigation` in
 * `lib/navigation.ts`, which the UI phase does not touch; these render the
 * restyled `AppSidebar` and check it shows that list, in that order, for a
 * reader with everything and for one with a few features - and that every
 * entry with pages under it still has its way in.
 *
 * Rendered to static markup (the runner has no DOM), at desktop width.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";
import type { FlyoutNode } from "@/components/layout/sidebar-flyout";
import type { FeatureNavChild as Child } from "@/lib/navigation";

const auth = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => "/receipts",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: () => true }),
}));
// What is waiting, per module page (Lucas 2026-10-08: a number beside
// every module, not only 材料管理). 材料管理 adds its two pages up.
const badges = vi.hoisted(() => ({
  counts: {
    material_receipts: 2,
    material_outgoing: 4,
    equipment: 5,
    safety: 1,
    sundry_claims: 7,
    approvals: 3,
    site_disposals: 2,
    field_tasks: 1,
  } as Record<string, number>,
}));
vi.mock("@/hooks/use-unread-badges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-unread-badges")>()),
  useUnreadBadges: () => badges.counts,
}));
// The footer's own controls are not the subject here.
vi.mock("@/components/layout/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/shared/offline-status", () => ({ OfflineStatus: () => null }));

const { AppSidebar } = await import("@/components/layout/app-sidebar");
const { PORTAL_NAVIGATION, visibleNavigation } = await import("@/lib/navigation");
const { FlyoutPanel } = await import("@/components/layout/sidebar-flyout");
const { menuWaiting } = await import("@/hooks/use-unread-badges");

type Nav = { feature: string; anyFeatures?: string[]; children?: Nav[] };

/** Every feature key the contractor console's menu mentions, at any level. */
function allFeatures(): string[] {
  const keys = new Set<string>();
  const walk = (rows: readonly Nav[]) => {
    for (const row of rows) {
      if (row.feature) keys.add(row.feature);
      for (const key of row.anyFeatures ?? []) keys.add(key);
      if (row.children) walk(row.children);
    }
  };
  walk(PORTAL_NAVIGATION.MSE_TRACE as unknown as Nav[]);
  return [...keys];
}

function render(
  features: string[],
  permissions: string[],
  superuser: boolean,
  overrides: Record<string, unknown> = {},
) {
  auth.user = {
    id: "u1",
    full_name: "Reader",
    portal: "MSE_TRACE",
    features,
    permissions,
    is_superuser: superuser,
    company_name: "Company",
    branding: null,
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </TooltipProvider>
    </NextIntlClientProvider>,
  );
}

/** The menu's entries as rendered: each top-level link, in order. */
function renderedEntries(markup: string): string[] {
  return [...markup.matchAll(/<a [^>]*data-sidebar="menu-button"[^>]*href="([^"]+)"/g)].map(
    (match) => match[1].replaceAll("&amp;", "&"),
  );
}

function expectedEntries(features: string[], permissions: string[], superuser: boolean) {
  return visibleNavigation("MSE_TRACE", features, permissions, superuser).flatMap((group) =>
    group.items.map((item) => ({ ...item, groupKey: group.key })),
  );
}

describe("the restyled sidebar keeps the whole menu", () => {
  it("lists every module, in order, for a reader with every feature", () => {
    const features = allFeatures();
    const markup = render(features, [], true);
    const expected = expectedEntries(features, [], true);
    expect(expected.length).toBeGreaterThan(5);
    expect(renderedEntries(markup)).toEqual(expected.map((item) => item.href));
    const nav = messages.nav as Record<string, unknown>;
    for (const item of expected) {
      const label = item.labelKey
        .split(".")
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], nav) as string;
      expect(label, item.labelKey).toBeTruthy();
      expect(markup, item.labelKey).toContain(`<span>${label}</span>`);
    }
    // Every group heading is still there, in order.
    const groups = visibleNavigation("MSE_TRACE", features, [], true).map(
      (group) => (nav.group as Record<string, string>)[group.key],
    );
    let at = 0;
    for (const heading of groups) {
      const found = markup.indexOf(heading, at);
      expect(found, heading).toBeGreaterThan(-1);
      at = found;
    }
  });

  it("keeps a way into the pages under every entry that has them", () => {
    const features = allFeatures();
    const markup = render(features, [], true);
    const withMenus = expectedEntries(features, [], true).filter(
      (item) => (item.children?.length ?? 0) > 1 || Boolean(item.children?.[0]?.children?.length),
    );
    const openers = markup.match(/data-sidebar="menu-action"/g) ?? [];
    expect(withMenus.length).toBeGreaterThan(0);
    expect(openers).toHaveLength(withMenus.length);
  });

  /** `{feature: number shown}` for every entry that carries a badge. */
  function renderedBadges(markup: string): Record<string, string> {
    return Object.fromEntries(
      [...markup.matchAll(/data-sidebar-badge="([^"]+)"[^>]*>([^<]+)<\/span>/g)].map(
        (match) => [match[1], match[2]],
      ),
    );
  }

  it("shows a waiting count on every module that has one, not only 材料管理", () => {
    const markup = render(allFeatures(), [], true);
    expect(renderedBadges(markup)).toEqual({
      // 材料进场 2 + 材料出场 4, on the one 材料管理 entry.
      material_receipts: "6",
      // 设备: both pages share the feature, counted once.
      equipment: "5",
      // 回收: 垃圾清运 is counted here.
      recyclers: "2",
      // 顾问 / 隐患 / 文件审批 / 杂费报销 / 现场任务.
      hazard_rectification: "1",
      documents: "3",
      project_categories: "7",
      field_tasks: "1",
    });
    // 杂费报销 is the entry with the 7; its sibling entries on the same
    // feature (归档队列, 分类管理, Claim Engine) carry nothing.
    expect(markup.match(/data-sidebar-badge="project_categories"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /href="\/sundry-claims"[\s\S]*?data-sidebar-badge="project_categories"[^>]*>7</,
    );
  });

  it("shows nothing on a module with nothing waiting", () => {
    const markup = render(allFeatures(), [], true);
    expect(markup).not.toMatch(/data-sidebar-badge="progress"/);
    expect(markup).not.toMatch(/data-sidebar-badge="users"/);
  });

  it("shows nothing at all when the counts never loaded (Lucas 2026-10-09)", () => {
    // 「如果是0的话就不用显示」: the hook gives no counts when the request
    // fails, and an entry without a number carries no badge - no "?".
    const loaded = badges.counts;
    badges.counts = {};
    try {
      const markup = render(allFeatures(), [], true);
      expect(markup).not.toMatch(/data-sidebar-badge=/);
      expect(markup).not.toMatch(/>\?<\/span>/);
    } finally {
      badges.counts = loaded;
    }
  });

  it("puts each count the backend sends on its own module's entry, and only there", async () => {
    const { BADGE_FEATURES } = await import("@/hooks/use-unread-badges");
    // Count key -> the entry (its `data-sidebar-badge`, the entry's feature)
    // the number appears on. 材料出场 is under 材料管理, 环保出场 and 垃圾清运
    // under 回收, 文件审批 under 文件, 杂费报销 is its own entry.
    const home: Record<string, string> = {
      material_receipts: "material_receipts",
      material_outgoing: "material_receipts",
      material_requests: "material_requests",
      field_tasks: "field_tasks",
      equipment: "equipment",
      waste_outgoing: "recyclers",
      site_disposals: "recyclers",
      consultant_applications: "consultant_applications",
      approvals: "documents",
      sundry_claims: "project_categories",
      site_access: "site_access",
      safety: "hazard_rectification",
    };
    expect(Object.keys(home).sort()).toEqual([...BADGE_FEATURES].sort());
    const loaded = badges.counts;
    try {
      for (const key of BADGE_FEATURES) {
        badges.counts = { [key]: 1 };
        const shown = renderedBadges(render(allFeatures(), [], true));
        expect(shown, key).toEqual({ [home[key]]: "1" });
      }
      // Zero everywhere: nothing shown at all, not a row of zeroes.
      badges.counts = Object.fromEntries(BADGE_FEATURES.map((key) => [key, 0]));
      const markup = render(allFeatures(), [], true);
      expect(markup).not.toMatch(/data-sidebar-badge=/);
      expect(markup).not.toMatch(/>\?<\/span>/);
      // A big pile is capped so the menu keeps its width.
      badges.counts = { equipment: 250 };
      expect(renderedBadges(render(allFeatures(), [], true))).toEqual({ equipment: "99+" });
    } finally {
      badges.counts = loaded;
    }
  });

  it("filters by feature and permission exactly as the navigation rules say", () => {
    const features = ["dashboard", "material_receipts", "field_tasks"];
    const permissions: string[] = [];
    const markup = render(features, permissions, false);
    const expected = expectedEntries(features, permissions, false).map((item) => item.href);
    expect(renderedEntries(markup)).toEqual(expected);
    // Nothing from a module the reader does not have.
    const everything = expectedEntries(allFeatures(), [], true).map((item) => item.href);
    const hidden = everything.filter((href) => !expected.includes(href));
    expect(hidden.length).toBeGreaterThan(0);
    for (const href of hidden) expect(renderedEntries(markup)).not.toContain(href);
  });
});

describe("the menu under an entry shows where its number is (Lucas 2026-10-09)", () => {
  // 「hover的时候如果有事项也会看到号码在哪个分类，全部业务模块都是一样这个逻辑」
  const anchor = { top: 0, right: 0, left: 0, bottom: 0, width: 0, height: 0 } as DOMRect;

  function menu(labelKey: string, counts: Record<string, number>, level?: string): string {
    const item = expectedEntries(allFeatures(), [], true).find((row) => row.labelKey === labelKey);
    expect(item, labelKey).toBeDefined();
    const waiting = menuWaiting(item!, counts);
    const build = (rows: readonly Child[]): FlyoutNode[] =>
      rows.map((child) => ({
        key: child.key,
        label: child.key,
        href: child.href,
        active: false,
        waiting: waiting[child.key],
        children: child.children?.length ? build(child.children) : undefined,
      }));
    let nodes = build(item!.children ?? []);
    if (level) nodes = nodes.find((node) => node.key === level)?.children ?? [];
    return renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <FlyoutPanel
          anchor={anchor}
          feature={item!.feature}
          nodes={nodes}
          focusFirst={false}
          onPointerEnter={() => {}}
          onPointerLeave={() => {}}
          onBack={() => {}}
          onNavigate={() => {}}
        />
      </NextIntlClientProvider>,
    );
  }

  /** `{row key: number shown}` for every row of one panel that carries a badge. */
  function rowBadges(markup: string): Record<string, string> {
    return Object.fromEntries(
      [...markup.matchAll(/data-flyout-badge="([^"]+)"[^>]*>([^<]+)<\/span>/g)].map(
        (match) => [match[1], match[2]],
      ),
    );
  }

  it("puts each page's count on its own row, worded like the entry's", () => {
    const markup = menu("materialManagement", { material_receipts: 2, material_outgoing: 4 });
    expect(rowBadges(markup)).toEqual({ "5.2.1": "2", "5.2.2": "4" });
    // The entry's own name for what it counts, as its aria-label and title:
    // 待验收 deliveries and 材料出场's approvals, never a 【确认】 (2026-10-09).
    expect(markup).toMatch(/aria-label="[^"]*待审批\/验收[^"]*"/);
    expect(markup).not.toMatch(/待确认/);
    // And the entry above shows the two together.
    expect(render(allFeatures(), [], true)).toMatch(
      /data-sidebar-badge="material_receipts"[^>]*>6<\/span>/,
    );
  });

  it("shows no badge on a row with nothing waiting", () => {
    const markup = menu("materialManagement", { material_receipts: 0, material_outgoing: 3 });
    expect(rowBadges(markup)).toEqual({ "5.2.2": "3" });
    expect(rowBadges(menu("materialManagement", {}))).toEqual({});
  });

  it("gives a heading its pages' sum, and the panel it opens each page's own", () => {
    const counts = { material_quantity_report: 2, material_cost_report: 3 };
    expect(rowBadges(menu("report_center", counts))).toEqual({ "13.2.M": "5" });
    expect(rowBadges(menu("report_center", counts, "13.2.M"))).toEqual({
      "13.2.1": "2",
      "13.2.2": "3",
    });
  });

  it("caps a row at 99+, as the entry is", () => {
    expect(rowBadges(menu("equipment", { equipment: 250 }))).toEqual({ "6.2.1": "99+" });
  });
});

describe("the sidebar's top is the company's own (JB161, 客户 11-10 第十批)", () => {
  // 「logo设置的位置太小了，mse trace那个字母可以不要」 (图28).
  const LOGO = "https://cdn.example/company/logo/builder.png";
  const branding = (logo: string | null) => ({
    name: "测试建筑商 1",
    short_name: "测试建筑商 1",
    company_id: "c1",
    company_name: "测试建筑商 1",
    company_logo_url: logo,
    company_background_url: null,
    platform_icon_url: null,
    icon_url: logo,
    revision: null,
    uses_platform_default: !logo,
  });
  /** The header alone, so a menu label can never answer for it. */
  const header = (markup: string) =>
    markup.match(/<div data-slot="sidebar-header"[\s\S]*?<div data-slot="sidebar-content"/)?.[0] ?? "";

  it("shows a company's logo large, at its own shape, over its name, with no 「MSE Trace」", () => {
    const top = header(
      render(["dashboard"], [], false, {
        company: "c1",
        company_name: "测试建筑商 1",
        branding: branding(LOGO),
      }),
    );
    expect(top).toContain('data-sidebar-brand="logo"');
    // The upload itself, not the square favicon made from it.
    const logo = top.match(/<img [^>]*src="([^"]+)"[^>]*>/);
    expect(logo?.[1]).toBe(LOGO);
    // 第十一批: 「建议显示区域 180 × 100px」「保持 Logo 原始比例，不拉伸、不变形」 -
    // fitted whole inside 180 × 100 and centred; inside the rail's 44 px
    // square when the sidebar is collapsed.
    expect(top).toMatch(/data-sidebar-brand="logo"[^>]*class="flex flex-col items-center\b/);
    // JB164 (Lucas 11-11 「把白色的边边去掉，留Logo就好，弄成会适配所有logo的」):
    // no plate - only the picture. Its height is fixed and its width follows
    // its own ratio (never a fixed width), up to 180 px: a square logo is
    // 100 × 100, a 2 : 1 one 180 × 90 inside the box, a tall one 50 × 100.
    const cls = logo?.[0].match(/class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(cls).toEqual(expect.arrayContaining(["h-25", "w-auto", "max-w-[min(100%,11.25rem)]", "object-contain"]));
    expect(cls.filter((name) => /^w-(?!auto)/.test(name))).toEqual([]);
    expect(cls).toEqual(expect.arrayContaining(["group-data-[collapsible=icon]:h-11", "group-data-[collapsible=icon]:max-w-11"]));
    // A faint light halo on its own outline in the dark theme only - no box.
    expect(cls.filter((name) => name.startsWith("dark:"))).toEqual([
      "dark:drop-shadow-[0_0_1px_color-mix(in_oklch,var(--foreground)_40%,transparent)]",
    ]);
    // Nothing around it: no white plate, border, frame, padding or glow.
    const brand = top.slice(top.indexOf('data-sidebar-brand="logo"'), top.indexOf("<img"));
    expect(brand).not.toMatch(/<span/);
    for (const plate of ["bg-switch-thumb", "border-panel-border", "rounded-xl", "shadow-glow"]) {
      expect(top, plate).not.toContain(plate);
    }
    expect(top).not.toMatch(/[\s"]p-(1\.5|0\.5)[\s"]/);
    // JB164 item 6: the block hugs the logo - no extra height around it.
    expect(top).toMatch(/data-sidebar-brand="logo"[^>]*class="[^"]*\bpy-0\.5\b/);
    expect(top).toContain("测试建筑商 1");
    expect(top).not.toContain("MSE Trace");
  });

  it("keeps the MSE icon beside the name for a company with no logo yet - still no 「MSE Trace」", () => {
    const top = header(
      render(["dashboard"], [], false, {
        company: "c1",
        company_name: "测试建筑商 1",
        branding: branding(null),
      }),
    );
    expect(top).toContain('data-sidebar-brand="company"');
    expect(top).toContain('src="/mse-icon-192.png"');
    expect(top).toContain("测试建筑商 1");
    expect(top).not.toContain("MSE Trace");
  });

  it("keeps the portal's name for an account with no company of its own", () => {
    for (const [portal, words] of [
      ["MSE_ADMIN", "MSE Admin"],
      ["MSE_TRACE", "MSE Trace"],
    ] as const) {
      const top = header(
        render(["dashboard"], [], false, { portal, company: null, company_name: null }),
      );
      expect(top, portal).toContain('data-sidebar-brand="portal"');
      expect(top, portal).toContain(words);
    }
  });
});
