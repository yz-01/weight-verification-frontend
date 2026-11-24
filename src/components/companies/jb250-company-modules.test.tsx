/**
 * JB250 (客户 11-24 事项 1) on screen: MSE's 「业务模块」 on a company's page.
 *
 * > 由 MSE Admin 根据每家客户公司的业务需求，独立控制各个业务模块的开启或关闭。
 * > 关闭的模块在该公司的后台及手机端均不可使用，也不能通过直接链接或 API 绕过权限访问。
 *
 * The server decides (companies.tests.test_jb250_company_modules); here: the
 * ticks, the menu and the route guard following the features it returns.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CompanyModulesPanel, toggleModule } from "@/components/companies/company-modules-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { isRouteAllowed, visibleNavigation } from "@/lib/navigation";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "mse" }, can: (code: string) => code === "company.update" || code === "company.view" }),
}));

const MODULES = {
  company: "c1",
  choices: ["projects", "field_tasks", "material_receipts", "site_disposals", "gate_records"],
  always_on: ["dashboard", "notifications"],
  disabled: ["material_receipts"],
  not_in_plan: ["gate_records"],
};

function render() {
  const client = new QueryClient();
  client.setQueryData(["companies", "modules", "c1"], MODULES);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh}>
        <TooltipProvider>
          <CompanyModulesPanel companyId="c1" />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("JB250 业务模块 on MSE's company page", () => {
  it("lists every module with a tick: on ticked, off unticked, the package's own grey", () => {
    const html = render();
    expect(html).toContain("业务模块");
    expect(html).toContain("已开 3 / 5 个模块");
    expect(html).toMatch(/data-module="site_disposals"[^>]*>[\s\S]*?data-state="checked"/);
    expect(html).toMatch(/data-module="material_receipts" data-off="true"[\s\S]*?data-state="unchecked"/);
    expect(html).toContain("（套餐不包含）");
    expect(html).toContain("保存模块");
  });

  it("a tick switches one module, in the menu's order", () => {
    expect(toggleModule(["material_receipts"], "site_disposals", false, MODULES.choices)).toEqual([
      "material_receipts",
      "site_disposals",
    ]);
    expect(toggleModule(["material_receipts", "site_disposals"], "material_receipts", true, MODULES.choices)).toEqual([
      "site_disposals",
    ]);
  });

  it("is on the company page", () => {
    const page = readFileSync(path.join(process.cwd(), "src/components/companies/view-company.tsx"), "utf8");
    expect(page).toContain("<CompanyModulesPanel companyId={data.id} />");
  });

  it("a module the server leaves out is gone from the menu and its address is refused", () => {
    const on = ["dashboard", "field_tasks", "site_disposals", "gate_records", "site_access"];
    const off = on.filter((key) => key !== "site_disposals");
    const entries = (features: string[]) =>
      visibleNavigation("MSE_TRACE", features).flatMap((group) => group.items.map((entry) => entry.feature));
    expect(entries(on)).toContain("site_disposals");
    expect(entries(off)).not.toContain("site_disposals");
    expect(isRouteAllowed("MSE_TRACE", on, "/waste-clearance")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", off, "/waste-clearance")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", off, "/site-disposals")).toBe(false);
  });

  it("has its words, the audit line and the refusal in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb250.title).toBeTruthy();
      expect(messages.jb250.count).toContain("{on}");
      expect(messages.audit.operation.company_modules_by_platform).toBeTruthy();
      expect(messages.errors.api.company_module_invalid).toBeTruthy();
    }
    expect(zh.jb250.help).not.toContain("您");
  });
});
