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
  } as Record<string, number | null>,
}));
vi.mock("@/hooks/use-unread-badges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-unread-badges")>()),
  useUnreadBadges: () => badges.counts,
  badgeLabelKey: () => "nav.waitingUnknown",
}));
// The footer's own controls are not the subject here.
vi.mock("@/components/layout/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/shared/offline-status", () => ({ OfflineStatus: () => null }));

const { AppSidebar } = await import("@/components/layout/app-sidebar");
const { PORTAL_NAVIGATION, visibleNavigation } = await import("@/lib/navigation");

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

function render(features: string[], permissions: string[], superuser: boolean) {
  auth.user = {
    id: "u1",
    full_name: "Reader",
    portal: "MSE_TRACE",
    features,
    permissions,
    is_superuser: superuser,
    company_name: "Company",
    branding: null,
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

  it("marks every entry that could carry a number when the counts never loaded", () => {
    const loaded = badges.counts;
    badges.counts = Object.fromEntries(
      ["material_receipts", "material_outgoing", "equipment", "safety"].map((key) => [key, null]),
    );
    try {
      const markup = render(allFeatures(), [], true);
      expect(markup).not.toMatch(/data-sidebar-badge=/);
      const unknown = markup.match(/>\?<\/span>/g) ?? [];
      // 材料管理, 设备, 隐患整改 - one "?" each, never two on one entry.
      expect(unknown).toHaveLength(3);
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
