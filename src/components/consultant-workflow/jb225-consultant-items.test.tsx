/**
 * JB225 (客户 11-19 事项 5) on screen:
 *
 * > 目前材料管理和工程进度都是以整个模块开放权限，总部无法单独控制子模块的查看权限。
 * > 材料管理：材料进场、材料退场、材料领用、按供应商统计、材料目标。
 * > 工程进度：施工进度、施工日报告、雨天记录、施工计划。
 * > 以上各项请设置独立的勾选权限，由建筑商总部自行决定开放哪些内容给顾问。
 * > 未勾选的事项，顾问不得查看、搜索、下载或导出，后台数据访问权限也必须同步限制。
 *
 * The head office's tick screen (items under their module, 「已勾 N 项」, 全选),
 * the consultant's menu in the client's nine words, the route guard per item,
 * the 材料管理 views, the 材料出场 switch, the 工程进度 tabs and the refusal
 * words. Rendered to static markup like the other screen tests.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ConsultantProjectAccessGrant } from "@/interfaces/consultant-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { outgoingKindsFor } from "@/lib/consultant-modules";
import { isRouteAllowed, navLeaves, visibleNavigation } from "@/lib/navigation";
import { refusedPageNotice } from "@/lib/refused-page";

const auth = vi.hoisted(() => ({
  user: { id: "u1", account_type: "TENANT" as string, full_name: "Someone" },
  codes: new Set<string>(["company_settings.view", "project.assign", "user.view", "project.view"]),
}));
const address = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/consultant-access",
  useSearchParams: () => address.params,
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: (code: string) => auth.codes.has(code) }),
}));

const { GrantDialog } = await import("@/components/consultant-workflow/consultant-access-management");
const { materialTabClosed, materialTabHref, firstOpenMaterialTab, MaterialItemRefusedNote, withItemRefused } =
  await import("@/components/receipts/material-tabs");
const { progressTabsFor } = await import("@/components/progress/progress-page");

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** The checkbox state of the label holding `attribute="key"`: "true", "false" or "mixed". */
function state(html: string, attribute: "data-module" | "data-item", key: string): string {
  const start = html.indexOf(`${attribute}="${key}"`);
  expect(start, `${attribute}=${key} is drawn`).toBeGreaterThan(-1);
  const label = html.slice(start, html.indexOf("</label>", start));
  return /aria-checked="(true|false|mixed)"/.exec(label)?.[1] ?? "";
}

const GRANT: ConsultantProjectAccessGrant = {
  id: "g1",
  organization: "o1",
  organization_name: "Independent Engineers",
  consultant: "c1",
  consultant_name: "Resident Engineer",
  consultant_email: "engineer@example.test",
  project: "p1",
  project_name: "Tower",
  project_code: "PRJ-1",
  modules: ["dashboard", "materials", "progress"],
  sub_modules: ["materials.in", "materials.issues", "materials.targets", "progress.records", "progress.schedule",
    "progress.daily_reports", "progress.rain"],
  permissions: ["approval.view"],
  is_active: true,
  is_current: true,
  valid_from: "2026-11-01T00:00:00Z",
  valid_until: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const dialog = (row: ConsultantProjectAccessGrant) =>
  render(
    <GrantDialog
      row={row}
      organizations={[{ id: "o1", name: "Independent Engineers" } as never]}
      members={[]}
      projects={[{ id: "p1", code: "PRJ-1", name: "Tower" }]}
      onClose={() => undefined}
      onSaved={() => undefined}
    />,
  );

describe("the tick screen: nine items under 材料管理 and 工程进度 (以上各项请设置独立的勾选权限)", () => {
  it("lists the client's nine under their modules, in his order and words, each with where it is", () => {
    const html = dialog(GRANT);
    const items = [...html.matchAll(/data-item="([^"]+)"/g)].map((match) => match[1]);
    expect(items).toEqual([
      // JB265 (客户 11-26 事项 6): 现场任务 comes first in the client's 11.
      "field_tasks.view",
      "field_tasks.assign",
      "field_tasks.accept",
      "materials.in",
      "materials.returns",
      "materials.issues",
      "materials.supplier_totals",
      "materials.targets",
      "progress.records",
      "progress.daily_reports",
      "progress.rain",
      "progress.schedule",
    ]);
    const words = text(html);
    for (const name of ["材料进场", "材料退场", "材料领用", "按供应商统计", "材料目标", "施工进度", "施工日报告", "雨天记录", "施工计划"]) {
      expect(words).toContain(name);
    }
    expect(words).toContain(zh.consultantAccess.itemHint.materialsReturns);
    // No key shown as a word.
    expect(words).not.toContain("materials.in");
  });

  it("shows a partly ticked module as such, a whole one as ticked", () => {
    const html = dialog(GRANT);
    expect(state(html, "data-module", "materials")).toBe("mixed");
    expect(text(html)).toContain("已勾 3 项，共 5 项");
    // A dash in the box, never a ✓ an older reader takes for "all" (audit 11-19 F8).
    const parent = (key: string) => {
      const start = html.indexOf(`data-module="${key}"`);
      return html.slice(start, html.indexOf("</label>", start));
    };
    expect(parent("materials")).toContain("lucide-minus");
    expect(parent("materials")).not.toContain("lucide-check");
    expect(parent("progress")).toContain("lucide-check");
    expect(state(html, "data-item", "materials.in")).toBe("true");
    expect(state(html, "data-item", "materials.returns")).toBe("false");
    expect(state(html, "data-module", "progress")).toBe("true");
  });

  it("reads a grant saved before JB225 (module alone) as every item ticked", () => {
    const html = dialog({ ...GRANT, sub_modules: undefined, modules: ["dashboard", "materials"] });
    expect(state(html, "data-module", "materials")).toBe("true");
    expect(state(html, "data-item", "materials.supplier_totals")).toBe("true");
    expect(state(html, "data-module", "progress")).toBe("false");
    expect(state(html, "data-item", "progress.rain")).toBe("false");
  });

  it("has every word in the four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const group of ["item", "itemHint", "itemShort"] as const) {
        expect(Object.keys(messages.consultantAccess[group]).sort()).toEqual(Object.keys(zh.consultantAccess[group]).sort());
      }
      expect((messages.errors.api as Record<string, string>).consultant_sub_module_not_granted).toBeTruthy();
      expect(messages.documents.recordLinks.notGranted).toBeTruthy();
      expect(messages.consultantAccess.grant.partialCount).toContain("{held}");
    }
    expect(zh.errors.api.consultant_sub_module_not_granted).toBe("总部没有为您在这个项目开通这一项。如需查看，请联系总部。");
  });
});

/** Every page the menu shows, headings left out. */
function menuPages(features: string[], permissions: string[] = []) {
  return visibleNavigation("MSE_TRACE", features, permissions).flatMap((group) =>
    group.items.flatMap((item) => (item.children?.length ? navLeaves(item.children) : [])),
  );
}

describe("the consultant's menu: his ticked items, in the client's words", () => {
  // What `consultant_features` returns for 材料进场 + 材料领用 + 材料目标 + 施工进度 + 施工计划.
  const consultant = [
    "dashboard",
    "material_receipts",
    "material_outgoing",
    "progress",
    "schedule",
    "item_materials_in",
    "item_materials_issues",
    "item_materials_targets",
    "item_progress_records",
    "item_progress_schedule",
    "consultant_menu",
  ];

  it("lists exactly the ticked items under 材料管理 and 工程进度", () => {
    const leaves = menuPages(consultant);
    const labels = leaves.map((leaf) => leaf.labelKey);
    expect(labels).toEqual(
      expect.arrayContaining([
        "consultantAccess.item.materialsIn",
        "consultantAccess.item.materialsIssues",
        "consultantAccess.item.materialsTargets",
        "consultantAccess.item.progressRecords",
        "consultantAccess.item.progressSchedule",
      ]),
    );
    for (const missing of [
      "consultantAccess.item.materialsReturns",
      "consultantAccess.item.materialsSupplierTotals",
      "consultantAccess.item.progressDailyReports",
      "consultantAccess.item.progressRain",
      // The contractor's own names are not his menu.
      "nav.submodule.materialOutgoing",
    ]) {
      expect(labels).not.toContain(missing);
    }
    const hrefs = leaves.map((leaf) => leaf.href);
    expect(hrefs).toContain("/material-outgoing?kind=ISSUE");
    expect(hrefs).toContain("/progress?tab=schedule");
  });

  it("hides a module's group when none of its items is ticked", () => {
    const groups = visibleNavigation("MSE_TRACE", ["dashboard", "safety", "hazard_rectification", "consultant_menu"]);
    const keys = groups.flatMap((group) => group.items.map((item) => item.feature));
    expect(keys).not.toContain("material_receipts");
    expect(keys).not.toContain("progress");
  });

  it("opens a page with any item that lives on it and refuses one with none", () => {
    expect(isRouteAllowed("MSE_TRACE", consultant, "/receipts")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", consultant, "/material-outgoing")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", consultant, "/progress")).toBe(true);
    // Only 按供应商统计: /receipts opens (its totals view); without either, no.
    const totalsOnly = ["material_receipts", "item_materials_supplier_totals", "consultant_menu"];
    expect(isRouteAllowed("MSE_TRACE", totalsOnly, "/receipts")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", totalsOnly, "/material-targets")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", totalsOnly, "/material-outgoing")).toBe(false);
  });

  it("follows the items in 报表中心", () => {
    const reports = [...consultant, "report_center", "report_progress", "report_schedule", "material_quantity_report"];
    expect(isRouteAllowed("MSE_TRACE", reports, "/reports/contractor/progress")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", reports, "/reports/contractor/schedule")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", reports, "/reports/contractor/daily_report")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", reports, "/reports/contractor/material_returns")).toBe(false);
  });

  it("leaves the contractor's menu as it was (「已经弄好的功能不要改到」)", () => {
    const contractor = ["dashboard", "material_receipts", "material_outgoing", "progress", "schedule"];
    const labels = menuPages(contractor).map((leaf) => leaf.labelKey);
    expect(labels).toContain("nav.submodule.materialReceipts");
    expect(labels).toContain("nav.submodule.materialOutgoing");
    expect(labels).not.toContain("consultantAccess.item.materialsIn");
  });
});

describe("the pages follow the items", () => {
  const only = (...items: string[]) => [...items.map((item) => `item_${item.replace(".", "_")}`), "consultant_menu"];

  it("材料管理's views: only the ticked ones, /receipts without 材料进场 opens the totals", () => {
    const features = only("materials.supplier_totals", "materials.issues");
    expect(materialTabClosed("in", features)).toBe(true);
    expect(materialTabClosed("reject", features)).toBe(true);
    expect(materialTabClosed("totals", features)).toBe(false);
    expect(materialTabClosed("targets", features)).toBe(true);
    expect(materialTabClosed("out", features)).toBe(false);
    expect(materialTabHref("out", features)).toBe("/material-outgoing?kind=ISSUE");
    expect(firstOpenMaterialTab(features)).toBe("out");
    expect(firstOpenMaterialTab(only("materials.supplier_totals"))).toBe("totals");
    // A contractor: every view, as before.
    expect(materialTabClosed("in", ["material_receipts"])).toBe(false);
  });

  it("材料出场: the switch shows only the ticked side", () => {
    expect(outgoingKindsFor(only("materials.issues"))).toEqual(["ISSUE"]);
    expect(outgoingKindsFor(only("materials.returns", "materials.issues"))).toEqual(["RETURN", "ISSUE"]);
    expect(outgoingKindsFor(["material_outgoing"])).toEqual(["RETURN", "ISSUE"]);
  });

  it("工程进度's tabs: the tabs of his items (施工分类 / 工程时间轴 / 摘要 with 施工进度)", () => {
    expect(progressTabsFor([...only("progress.rain"), "progress"])).toEqual(["rain"]);
    expect(progressTabsFor([...only("progress.records", "progress.schedule"), "progress", "schedule"])).toEqual([
      "phases",
      "photos",
      "schedule",
      "summary",
    ]);
    // A contractor: as before.
    expect(progressTabsFor(["progress", "schedule"])).toEqual(["phases", "photos", "reports", "schedule", "summary", "rain"]);
  });

  it("a refused item page says it is this item, in the client's words", () => {
    expect(refusedPageNotice("/material-targets", only("materials.in"))).toBe("errors.api.consultant_sub_module_not_granted");
    expect(refusedPageNotice("/progress", only("materials.in"))).toBe("errors.api.consultant_module_not_granted");
    expect(refusedPageNotice("/receipts", ["material_receipts"])).toBe("common.pageNotOpen");
  });

  it("says why when a material view he asked for is not his, as 工程进度 does (audit 11-19 F8)", () => {
    const sentence = "总部没有为您在这个项目开通这一项。如需查看，请联系总部。";
    expect(withItemRefused("/receipts?view=totals")).toBe("/receipts?view=totals&refused=1");
    expect(withItemRefused("/material-targets")).toBe("/material-targets?refused=1");
    expect(text(render(<MaterialItemRefusedNote shown />))).toContain(sentence);
    expect(render(<MaterialItemRefusedNote />)).not.toContain("item-refused");
    address.params = new URLSearchParams("view=totals&refused=1");
    try {
      expect(text(render(<MaterialItemRefusedNote />))).toContain(sentence);
    } finally {
      address.params = new URLSearchParams();
    }
    // 文件档案's linked record of an unticked item says whom to ask, in all four.
    expect(zh.documents.recordLinks.notGranted).toBe("总部没有为您开通这一项。如需查看，请联系总部。");
    expect(zhTW.documents.recordLinks.notGranted).toContain("請聯絡總部");
    expect(en.documents.recordLinks.notGranted).toContain("Ask head office");
    expect(ms.documents.recordLinks.notGranted).toContain("Hubungi ibu pejabat");
  });

  it("opens the returns typed on the receipt form before 10-02 with 材料退场 alone (Decision 3)", () => {
    const returnsOnly = [...only("materials.returns"), "material_outgoing"];
    expect(isRouteAllowed("MSE_TRACE", returnsOnly, "/receipts")).toBe(true);
    // ... as the 材料出场 view of /receipts (?direction=OUT), never the deliveries.
    expect(materialTabClosed("out", returnsOnly)).toBe(false);
    expect(materialTabClosed("in", returnsOnly)).toBe(true);
    const labels = menuPages(returnsOnly).map((leaf) => leaf.labelKey);
    expect(labels).not.toContain("consultantAccess.item.materialsIn");
    expect(labels).not.toContain("receipts.tabs.legacyReturns");
    // Without 材料退场 the address stays closed.
    expect(isRouteAllowed("MSE_TRACE", [...only("materials.issues"), "material_outgoing"], "/receipts")).toBe(false);
  });
});

describe("a backend from before JB225 sends no item keys: whole modules, as JB210 (audit 11-19 F3)", () => {
  // What JB210's `consultant_features` sends with 材料管理 and 工程进度 ticked.
  const older = ["dashboard", "material_receipts", "material_outgoing", "progress", "schedule", "consultant_menu"];

  it("lacks no item, so no view or tab is emptied", () => {
    expect(materialTabClosed("in", older)).toBe(false);
    expect(materialTabClosed("totals", older)).toBe(false);
    expect(materialTabClosed("targets", older)).toBe(false);
    expect(outgoingKindsFor(older)).toEqual(["RETURN", "ISSUE"]);
    expect(progressTabsFor(older)).toEqual(["phases", "photos", "reports", "schedule", "summary", "rain"]);
  });

  it("keeps 材料管理 and 工程进度 in his menu and their pages open", () => {
    expect(isRouteAllowed("MSE_TRACE", older, "/receipts")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", older, "/material-outgoing")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", older, "/progress")).toBe(true);
    const hrefs = menuPages(older).map((leaf) => leaf.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/receipts", "/material-outgoing"]));
  });
});
