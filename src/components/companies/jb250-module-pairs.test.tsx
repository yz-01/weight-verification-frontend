/**
 * JB250 follow-up (客户 11-24 事项 1): 「关闭的模块在该公司的后台及手机端均不可使用，
 * 也不能通过直接链接或 API 绕过权限访问」 - on screen.
 *
 * The server closes the module on every path
 * (companies.tests.test_jb250_module_pairs); here:
 * - a blocked page address says 「这个功能你的公司没有开通，请联系总部或 MSE」;
 * - MSE's 业务模块 panel says what a tick does that the tick alone does not;
 * - a report whose source module is off says 「材料进场 没有开通，这个报表没有资料」;
 * - a head-office card and a 项目现场费用总览 card of a closed module say 「没有开通」;
 * - the gate phone's two buttons follow 门岗记录 and 工地门禁.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { isRouteAllowed, refusedByCompanyModule } from "@/lib/navigation";
import { refusedPageNotice } from "@/lib/refused-page";
import { cardModuleOff, MODULE_NOTES, reportSourcesOff } from "@/lib/company-modules";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "mse" }, can: (code: string) => code === "company.update" || code === "company.view" }),
}));

vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({ active: false, projectId: null }),
}));

const { CompanyModulesPanel } = await import("@/components/companies/company-modules-panel");
const { HeadquartersKpis } = await import("@/components/dashboard/headquarters-reference");
const { ModuleOffNotice } = await import("@/components/shared/module-off-notice");
const { TooltipProvider } = await import("@/components/ui/tooltip");

function render(node: React.ReactNode, setup?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  setup?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("a blocked page address says why", () => {
  const features = ["dashboard", "site_access", "field_tasks"];

  it("a page of a module the company does not have: 「这个功能你的公司没有开通」", () => {
    expect(isRouteAllowed("MSE_TRACE", features, "/gate-records")).toBe(false);
    expect(refusedByCompanyModule("MSE_TRACE", features, ["gate_records"], "/gate-records")).toBe(true);
    expect(refusedPageNotice("/gate-records", features, true)).toBe("jb250fix.pageModuleOff");
    expect(zh.jb250fix.pageModuleOff).toBe("这个功能你的公司没有开通，请联系总部或 MSE。");
  });

  it("a page the account itself may not open keeps its own words", () => {
    expect(refusedByCompanyModule("MSE_TRACE", features, ["gate_records"], "/deductions")).toBe(false);
    expect(refusedByCompanyModule("MSE_TRACE", features, [], "/gate-records")).toBe(false);
    expect(refusedPageNotice("/deductions", features, false)).toBe("common.pageNotOpen");
    // The home address never says anything.
    expect(refusedPageNotice("/dashboard", features, true)).toBeNull();
  });

  it("the shell asks with the company's modules_off", () => {
    const shell = source("src/components/layout/dashboard-shell.tsx");
    expect(shell).toContain("refusedByCompanyModule(");
    expect(shell).toContain("user.modules_off");
  });
});

describe("MSE's 业务模块 panel notes", () => {
  const MODULES = {
    company: "c1",
    choices: ["hazard_rectification", "gate_records", "site_access", "material_receipts", "material_quantity_report", "material_cost_report"],
    always_on: ["dashboard"],
    disabled: [],
    not_in_plan: [],
  };

  it("one line under each pair, and no 「安全事故」 tick of its own", () => {
    const html = render(<CompanyModulesPanel companyId="c1" />, (client) =>
      client.setQueryData(["companies", "modules", "c1"], MODULES),
    );
    expect(html).toContain(zh.jb250fix.noteSafety);
    expect(html).toContain(zh.jb250fix.noteGate);
    expect(html).toContain(zh.jb250fix.noteReports);
    expect(html).toMatch(/data-module="gate_records"[\s\S]*?data-module-note="noteGate"/);
    expect(html).toMatch(/data-module="site_access"[\s\S]*?data-module-note="noteGate"/);
    expect(html).toMatch(/data-module="hazard_rectification"[\s\S]*?data-module-note="noteSafety"/);
    expect(html).not.toContain('data-module="material_receipts" data-module-note');
    expect(MODULE_NOTES.safety).toBeUndefined();
  });
});

describe("a report of a closed module says so", () => {
  it("「材料进场 没有开通，这个报表没有资料。」", () => {
    const html = render(<ModuleOffNotice modules={["material_receipts"]} title="材料数量报表" />);
    expect(html).toContain("材料进场 没有开通，这个报表没有资料。");
    expect(html).toContain('data-module-off="material_receipts"');
  });

  it("only when every source module is off", () => {
    expect(reportSourcesOff("material_quantity", new Set(["material_receipts"]))).toEqual(["material_receipts"]);
    expect(reportSourcesOff("material_cost", new Set(["material_receipts"]))).toEqual(["material_receipts"]);
    expect(reportSourcesOff("material_quantity", new Set(["gate_records"]))).toBeNull();
    // 清运与回收: one of its two modules off leaves the other's rows.
    expect(reportSourcesOff("recycling", new Set(["site_disposals"]))).toBeNull();
    expect(reportSourcesOff("recycling", new Set(["site_disposals", "waste_dispatches"]))).toEqual([
      "site_disposals",
      "waste_dispatches",
    ]);
    expect(reportSourcesOff("photos", new Set(["photo_wall"]))).toBeNull();
  });

  it("the material reports and 报表中心 ask before reading", () => {
    expect(source("src/components/reports/material-report.tsx")).toContain("reportSourcesOff(");
    expect(source("src/components/contractor-ops/contractor-report-workspace.tsx")).toContain("reportSourcesOff(");
  });
});

describe("cards of a closed module say 「没有开通」", () => {
  it("head office", () => {
    expect(cardModuleOff("material_receipts_today", ["material_receipts"])).toBe(true);
    expect(cardModuleOff("overdue_rectifications", ["hazard_rectification"])).toBe(true);
    expect(cardModuleOff("open_tasks", ["field_tasks"])).toBe(true);
    expect(cardModuleOff("today_records", ["field_tasks"])).toBe(false);
    expect(cardModuleOff("material_receipts_today", undefined)).toBe(false);
    const dashboard = source("src/components/dashboard/headquarters-dashboard.tsx");
    expect(dashboard).toContain('modulesOff.has("gate_records") ? null : <GateCard />');
    expect(dashboard).toContain('modulesOff.has("material_receipts") ? null : <HeadquartersMaterialTargets');
    expect(source("src/components/dashboard/headquarters-figures.tsx")).toContain('moduleOff("site_disposals")');
  });

  it("the six figures at the top render 「没有开通」 with no number and no link", () => {
    const counts = {
      today_records: 7, on_site_now: 12, pending_approvals: 3, open_tasks: 0, overdue_tasks: 0,
      overdue_rectifications: 4, material_receipts_today: 2, today_records_by_kind: {},
    };
    const data = {
      date: "2026-11-27", modules_off: ["material_receipts", "hazard_rectification"],
      totals: { ...counts, projects: 1, active_projects: 1, yesterday: {} }, projects: [],
    } as unknown as Parameters<typeof HeadquartersKpis>[0]["data"];
    const html = render(<HeadquartersKpis data={data} />);
    expect(html).toContain('data-module-off="material_receipts_today"');
    expect(html).toContain('data-module-off="overdue_rectifications"');
    expect(html.match(/没有开通/g)?.length).toBe(2);
    expect(html).not.toContain('data-module-off="today_records"');
  });

  it("项目现场费用总览", () => {
    const page = source("src/components/reports/site-cost-overview.tsx");
    expect(page).toContain("row?.switched_off");
    expect(zh.jb250fix.cardOff).toBe("没有开通");
  });
});

describe("the gate phone", () => {
  it("「拍照」 follows 门岗记录, 「扫访客二维码」 工地门禁; the tile goes when both are off", () => {
    const gate = source("src/components/site-access/gate-records.tsx");
    expect(gate).toContain('!modulesOff.has(key === "photo" ? "gate_records" : "site_access")');
    expect(gate).toContain("enabled: gateRecordsOpen");
    const tiles = source("src/components/field-staff/field-records-panel.tsx");
    expect(tiles).toContain('modulesOff.has("gate_records") && modulesOff.has("site_access")');
  });
});

describe("words", () => {
  it("in all four languages, saying 你", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const key of ["pageModuleOff", "reportModuleOff", "cardOff", "noteSafety", "noteGate", "noteReports"] as const) {
        expect(messages.jb250fix[key], key).toBeTruthy();
      }
      expect(messages.jb250fix.reportModuleOff).toContain("{modules}");
    }
    expect(JSON.stringify(zh.jb250fix)).not.toContain("您");
    expect(JSON.stringify(zhTW.jb250fix)).not.toContain("您");
  });
});
