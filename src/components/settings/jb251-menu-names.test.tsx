/**
 * JB251 (客户 11-24 事项 2) on screen: a company's own menu names.
 *
 * > 能否由 MSE Admin 开放菜单名称自定义权限，让每家客户公司的授权登录用户自行修改菜单显示名称？
 * > 例如：「设备管理」可以改成「设备租赁管理」。
 * > 修改只影响该公司的菜单显示，不影响其他公司，也不改变原有功能、数据及权限。
 *
 * The server decides who, when and what (companies.tests.test_jb251_menu_names);
 * here: every place that draws a menu name reads the company's own, the
 * search finds both, the 公司设置 block and MSE's switch.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { changedMenuNames, CompanyMenuNamesPanel } from "@/components/companies/company-menu-names-panel";
import {
  CompanyMenuNamesSection,
  menuNameProblems,
  menuNamesChanged,
} from "@/components/settings/company-menu-names-section";
import { TooltipProvider } from "@/components/ui/tooltip";
import { navLabelOf } from "@/hooks/use-nav-label";
import keys from "@/lib/menu-name-keys.json";
import {
  cleanMenuNames,
  companyMenuName,
  companyMenuNameRows,
  menuNameKeys,
  menuNameProblem,
  moduleEntryMatches,
  withMenuName,
  withoutMenuName,
} from "@/lib/menu-names";
import { visibleNavigation } from "@/lib/navigation";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const auth = vi.hoisted(() => ({
  value: {
    user: { id: "u1", portal: "MSE_TRACE" } as Record<string, unknown> | null,
    can: (_code: string) => true,
    refresh: async () => {},
  },
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => auth.value,
}));

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

const OWN = {
  company: "c1",
  enabled: true,
  names: { "nav.equipment": { zh: "设备租赁管理", "zh-TW": "設備租賃管理" } },
  keys: keys.MSE_TRACE,
  features: ["dashboard", "equipment", "material_receipts", "company_settings"],
  languages: ["zh", "zh-TW", "en", "ms"],
  max_length: 20,
};

function render(node: React.ReactNode, data: Record<string, unknown>) {
  const client = new QueryClient();
  for (const [key, value] of Object.entries(data)) client.setQueryData(JSON.parse(key), value);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh}>
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const OWN_KEY = JSON.stringify(["company-menu-names", "own"]);

beforeEach(() => {
  auth.value = { user: { id: "u1", portal: "MSE_TRACE" }, can: () => true, refresh: async () => {} };
});

describe("JB251 the menu names a company may change", () => {
  it("are the menu's own names, in menu order - the list the server checks against", () => {
    expect(menuNameKeys("MSE_TRACE")).toEqual(keys.MSE_TRACE);
    expect(menuNameKeys("MSE_SCRAP")).toEqual(keys.MSE_SCRAP);
    // The client's example: 设备管理 and the pages under it.
    const trace = keys.MSE_TRACE;
    expect(trace.indexOf("nav.equipment")).toBeLessThan(trace.indexOf("nav.submodule.siteEquipment"));
    expect(zh.nav.equipment).toBe("设备管理");
  });

  it("a company's name in the reader's language, else the system name", () => {
    const names = { "nav.equipment": { zh: "设备租赁管理", en: "  " } };
    const system = (key: string) => `system:${key}`;
    expect(navLabelOf(names, "zh", "nav.equipment", system)).toBe("设备租赁管理");
    expect(navLabelOf(names, "en", "nav.equipment", system)).toBe("system:nav.equipment");
    expect(navLabelOf(names, "ms", "nav.equipment", system)).toBe("system:nav.equipment");
    expect(navLabelOf(names, "zh", "nav.projects", system)).toBe("system:nav.projects");
    // No names sent (MSE has not opened it, another company, MSE's own login).
    expect(navLabelOf(undefined, "zh", "nav.equipment", system)).toBe("system:nav.equipment");
    expect(companyMenuName(null, "zh", "nav.equipment")).toBeNull();
  });

  it("the search finds the company's name and the system name", () => {
    const entry = { label: "设备租赁管理", context: "运营", also: "设备管理" };
    expect(moduleEntryMatches(entry, "设备租赁")).toBe(true);
    expect(moduleEntryMatches(entry, "设备管理")).toBe(true);
    expect(moduleEntryMatches(entry, "材料")).toBe(false);
  });

  it("every place that draws a menu name reads the company's own", () => {
    const sidebar = source("src/components/layout/app-sidebar.tsx");
    expect(sidebar).toContain("label: navLabel(child.labelKey)");
    expect(sidebar).toContain("const label = navLabel(itemNameKey(item))");
    const toolbar = source("src/components/layout/dashboard-toolbar.tsx");
    expect(toolbar).toContain("const entry = navLabel(itemNameKey(current.item))");
    expect(toolbar).toContain("navLabel(current.leaf.labelKey)");
    const switcher = source("src/components/layout/page-switcher.tsx");
    expect(switcher).toContain("navLabel(here.labelKey)");
    expect(switcher).toContain("navLabel(itemNameKey(current.item))");
    expect(switcher).toContain("navLabel(page.labelKey)");
    const search = source("src/components/layout/global-module-search.tsx");
    expect(search).toContain("label: navLabel(child.labelKey)");
    expect(search).toContain("moduleEntryMatches(entry, normalized)");
    expect(search).toContain("also: t(moduleKey as never)");
    const reports = source("src/components/reports/report-selector.tsx");
    expect(reports).toContain("navLabel(report.labelKey)");
    expect(reports).toContain("navLabel(entry.labelKey)");
    // No menu name is drawn from the system words directly any more.
    for (const text of [sidebar, toolbar, switcher, search]) {
      expect(text).not.toMatch(/\bt\(`nav\.\$\{[a-z.]*labelKey\}`\)/);
      expect(text).not.toMatch(/\bt\((child|here|page|current\.leaf)\.labelKey\)/);
    }
  });

  it("names never change which menus or pages a person has", () => {
    const features = ["dashboard", "equipment", "material_receipts"];
    const before = JSON.stringify(visibleNavigation("MSE_TRACE", features, ["equipment.view"]));
    // The names live only in get_me's company_preferences; the menu's rules never read them.
    expect(source("src/lib/navigation.ts")).not.toContain("menu_names");
    expect(source("src/hooks/use-current-nav.ts")).not.toContain("menu_names");
    expect(JSON.stringify(visibleNavigation("MSE_TRACE", features, ["equipment.view"]))).toBe(before);
  });
});

describe("JB251 公司设置 › 菜单名称", () => {
  it("lists the company's menu with the system name, its own name, other languages and 恢复系统名称", () => {
    const html = render(<CompanyMenuNamesSection />, { [OWN_KEY]: OWN });
    expect(html).toContain("data-company-menu-names");
    expect(html).toContain("菜单名称");
    expect(html).toContain("只改左边菜单和页面最上面的名字；PDF、通知和说明文字仍用系统名称。");
    expect(html).toContain("你们公司的名称（中文）");
    expect(html).toContain("设备管理");
    expect(html).toContain('value="设备租赁管理"');
    expect(html).toContain('data-menu-name-restore="nav.equipment"');
    expect(html).toContain("其他语言");
    expect(html).toContain("保存菜单名称");
    // In menu order: 设备管理, then its pages; a module the company does not have is not listed.
    const rows = [...html.matchAll(/data-menu-name-row="([^"]+)"/g)].map((match) => match[1]);
    expect(rows.indexOf("nav.equipment")).toBeLessThan(rows.indexOf("nav.submodule.siteEquipment"));
    expect(rows).not.toContain("nav.site_disposals");
    expect(rows).toEqual(companyMenuNameRows("MSE_TRACE", OWN.features).map((row) => row.key));
  });

  it("shows nothing until MSE opens it", () => {
    expect(render(<CompanyMenuNamesSection />, { [OWN_KEY]: { ...OWN, enabled: false } })).toBe("");
  });

  it("only those who may change 公司设置 type and save", () => {
    auth.value = { ...auth.value, can: (code: string) => code !== "company_settings.manage" };
    const html = render(<CompanyMenuNamesSection />, { [OWN_KEY]: OWN });
    expect(html).not.toContain("保存菜单名称");
    expect(html).not.toContain("data-menu-name-restore");
    expect(html).toMatch(/data-menu-name-input="nav.equipment.zh"[^>]*disabled|disabled[^>]*data-menu-name-input="nav.equipment.zh"/);
  });

  it("not for MSE's own menu", () => {
    auth.value = { ...auth.value, user: { id: "mse", portal: "MSE_ADMIN" } };
    expect(render(<CompanyMenuNamesSection />, { [OWN_KEY]: OWN })).toBe("");
  });

  it("checks names the way the server does", () => {
    expect(menuNameProblem("设备租赁管理")).toBeNull();
    expect(menuNameProblem("")).toBeNull();
    expect(menuNameProblem("设".repeat(20))).toBeNull();
    expect(menuNameProblem("设".repeat(21))).toBe("tooLong");
    expect(menuNameProblem("设备\n租赁")).toBe("lineBreak");
    expect(menuNameProblem("<b>x</b>")).toBe("markup");
    expect(menuNameProblems({ "nav.equipment": { zh: "设".repeat(21), en: "ok" } })).toEqual({
      "nav.equipment.zh": "tooLong",
    });
  });

  it("typing, clearing and 恢复系统名称", () => {
    let names = withMenuName({}, "nav.equipment", "zh", "设备租赁管理");
    expect(names).toEqual({ "nav.equipment": { zh: "设备租赁管理" } });
    names = withMenuName(names, "nav.equipment", "en", "Equipment rental");
    names = withMenuName(names, "nav.equipment", "zh", "");
    expect(names).toEqual({ "nav.equipment": { en: "Equipment rental" } });
    expect(withoutMenuName(names, "nav.equipment")).toEqual({});
    expect(cleanMenuNames({ "nav.equipment": { zh: "  设备租赁管理 ", en: " " } })).toEqual({
      "nav.equipment": { zh: "设备租赁管理" },
    });
    expect(menuNamesChanged({ "nav.equipment": { zh: "设备租赁管理 " } }, OWN.names)).toBe(true);
    expect(menuNamesChanged({ "nav.equipment": { "zh-TW": "設備租賃管理", zh: "设备租赁管理" } }, OWN.names)).toBe(false);
  });

  it("sits in 公司设置 for a builder and a recycler", () => {
    expect(source("src/components/site-access/company-site-settings.tsx")).toContain("<CompanyMenuNamesSection />");
    expect(source("src/components/recycler-business/recycler-company-settings-workspace.tsx")).toContain(
      "<CompanyMenuNamesSection />",
    );
  });
});

describe("JB251 MSE's company page", () => {
  const MSE_KEY = JSON.stringify(["companies", "menu-names", "c1"]);

  it("has the switch next to 业务模块 and lists what the company changed", () => {
    auth.value = { ...auth.value, user: { id: "mse", portal: "MSE_ADMIN" }, can: (code: string) => code === "company.update" };
    const html = render(<CompanyMenuNamesPanel companyId="c1" />, { [MSE_KEY]: OWN });
    expect(html).toContain("允许这家公司自己改菜单名称");
    expect(html).toContain("这家公司改过的名称（1）");
    expect(html).toContain("设备管理");
    expect(html).toContain("设备租赁管理");
    expect(html).toContain("設備租賃管理");
    expect(html).not.toContain("现在没有打开");
    const page = source("src/components/companies/view-company.tsx");
    expect(page.indexOf("<CompanyModulesPanel companyId={data.id} />")).toBeLessThan(
      page.indexOf("<CompanyMenuNamesPanel companyId={data.id} />"),
    );
  });

  it("off: the names are kept and said not to show", () => {
    const html = render(<CompanyMenuNamesPanel companyId="c1" />, { [MSE_KEY]: { ...OWN, enabled: false } });
    expect(html).toContain("现在没有打开，这些名字不显示，菜单用系统名称。");
    expect(html).toContain("设备租赁管理");
  });

  it("the changed names in menu order", () => {
    expect(
      changedMenuNames(
        { "nav.submodule.siteEquipment": { en: "Machines" }, "nav.equipment": { zh: "设备租赁管理" } },
        keys.MSE_TRACE,
      ).map((row) => row.key),
    ).toEqual(["nav.equipment", "nav.submodule.siteEquipment"]);
  });
});

describe("JB251 words", () => {
  it("all four languages, the audit lines and the refusals", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb251.company.title).toBeTruthy();
      expect(messages.jb251.company.scope).toBeTruthy();
      expect(messages.jb251.mse.switch).toBeTruthy();
      expect(messages.jb251.company.problem.tooLong).toContain("{max}");
      expect(messages.audit.operation.menu_names_permission_by_platform).toBeTruthy();
      expect(messages.audit.operation.menu_names_update).toBeTruthy();
      expect(messages.errors.api.menu_names_not_enabled).toBeTruthy();
      expect(messages.errors.api.menu_name_invalid).toBeTruthy();
    }
    for (const messages of [zh, zhTW]) expect(JSON.stringify(messages.jb251)).not.toContain("您");
  });
});
