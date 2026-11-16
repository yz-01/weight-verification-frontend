/**
 * JB209 (Lucas 11-16 audit, Part D) - 云服务管理 fixes.
 *
 * - D-C2 (JB209-12): 使用单位 is a list of the six units the server accepts,
 *   in words, and a stored unit reads in words.
 * - D-C4 / D-C5 (JB209-15): 说明 is marked required where the server requires
 *   it; an Azure vendor takes its 租户 ID. D-C1 (JB209-11): an empty key box
 *   on edit is not sent.
 * - X-2 (JB209-14): lists read a hundred at a time with 「加载更多」.
 * - Part D usability (JB209-16): ✎ is named, a refused save names its field,
 *   预警 「内容」 in words, report files carry words, 阶梯收费 tiers in the open.
 *
 * Rendered to static markup (the runner has no DOM); the dialog wiring is
 * read in the source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/cloud-services/usage",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Admin", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
  }),
}));

const { CloudServiceManagementWorkspace, REPORT_VALUE_GROUPS, USAGE_UNITS, firstFieldError, unitLabel } = await import(
  "@/components/cloud-services/cloud-service-management-workspace"
);

const ROOT = process.cwd();
const SOURCE = readFileSync(
  path.join(ROOT, "src/components/cloud-services/cloud-service-management-workspace.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const body = (name: string) => {
  const start = SOURCE.indexOf(`function ${name}(`);
  const next = SOURCE.indexOf("\nfunction ", start + 1);
  return SOURCE.slice(start, next === -1 ? undefined : next);
};
const cloud = zh.adminCloudServiceManagement as unknown as Record<string, Record<string, string>>;

function page<T>(results: T[], count = results.length) {
  return { pages: [{ count, page: 1, page_size: 100, total_pages: Math.ceil(count / 100) || 1, results }], pageParams: [1] };
}

function render(node: React.ReactNode, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">{node}</NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const USAGE = {
  id: "u-1", usage_date: "2026-11-16", service_code: "CS-SMS", service_name: "SMS", service_type: "SMS_SERVICE",
  company_name: "ABC", project_name: "", usage_amount: "120.00", usage_unit: "MESSAGES", total_cost: "1.20",
  charge_amount: "2.40", profit: "1.20", source_mode: "MANUAL",
};

describe("JB209-12 D-C2: 使用单位 is a list of the six units, in words", () => {
  it("offers exactly the units the server accepts", () => {
    expect([...USAGE_UNITS]).toEqual(["GB", "TB", "REQUESTS", "MESSAGES", "HOURS", "TRANSACTIONS"]);
    for (const messages of [zh, zhTW, en, ms]) {
      const units = (messages.adminCloudServiceManagement as unknown as Record<string, Record<string, string>>).unit;
      for (const unit of [...USAGE_UNITS, "none"]) expect(units[unit], unit).toBeTruthy();
    }
  });

  it("uses the list in all three dialogs, not a free-text box", () => {
    expect(body("ServiceDialog")).toContain("<UnitSelect");
    expect(body("UsageDialog")).toContain("<UnitSelect");
    expect(body("PricingDialog")).toContain("<UnitSelect");
    expect(SOURCE).not.toMatch(/<Input\s+value=\{form\.usage_unit\}/);
  });

  it("reads a stored unit in words", () => {
    const html = text(render(<CloudServiceManagementWorkspace section="usage" />, (qc) =>
      qc.setQueryData(["cloud-usage", "paged"], page([USAGE])),
    ));
    expect(html).toContain(cloud.unit.MESSAGES);
    expect(html).not.toMatch(/\bMESSAGES\b/);
    expect(unitLabel((key) => `w:${key}`, "GB")).toBe("w:unit.GB");
    expect(unitLabel((key) => `w:${key}`, "OLD")).toBe("OLD");
  });
});

describe("JB209-15 / JB209-11 dialogs", () => {
  it("D-C4: 方案 and 收费规则 mark 说明 required and will not save without it", () => {
    for (const dialog of ["PlanDialog", "PricingDialog"]) {
      expect(body(dialog)).toMatch(/label=\{t\("field\.description"\)\}\s+required/);
      expect(body(dialog)).toContain('[form.description, t("field.description")]');
    }
  });

  it("D-C5: an Azure vendor takes its 租户 ID", () => {
    expect(body("VendorDialog")).toContain('tenant_id: row?.tenant_id ?? ""');
    expect(body("VendorDialog")).toContain('form.code.trim().toUpperCase() === "AZURE"');
    expect(body("VendorDialog")).toContain('label={t("field.tenantId")}');
    expect(cloud.field.tenantId).toContain("Azure");
  });

  it("D-C1: an empty key box on edit is left out of the save", () => {
    expect(body("VendorDialog")).toContain("const payload = row && !api_key ? rest : form;");
  });
});

describe("JB209-14 X-2: a hundred at a time", () => {
  it("offers 「加载更多」 when the server holds more vendors", () => {
    const html = text(render(<CloudServiceManagementWorkspace section="vendors" />, (qc) =>
      qc.setQueryData(["cloud-vendors", "paged"], page([{ id: "v-1", code: "AZURE", name: "Azure", contact_email: "", account_id: "", portal_url: "", is_active: true }], 130)),
    ));
    expect(html).toContain("已显示 1 笔，共 130 笔");
    expect(html).toContain("共 130 笔记录");
  });

  it("asks for no more than the server gives", () => {
    expect(SOURCE).not.toMatch(/page_size:\s*\d/);
    for (const panel of ["ServicePanel", "VendorPanel", "PlanPanel", "UsagePanel", "CostPanel", "PricingPanel", "AlertPanel"]) {
      expect(body(panel)).toContain("usePagedList(");
      expect(body(panel)).toContain("<LoadMoreRow list={rows} />");
    }
    expect(body("CatalogPanel")).toContain("readAllPages(");
  });
});

describe("JB209-16 Part D usability", () => {
  it("(b) names the ✎ button", () => {
    const html = render(<CloudServiceManagementWorkspace section="vendors" />, (qc) =>
      qc.setQueryData(["cloud-vendors", "paged"], page([{ id: "v-1", code: "AZURE", name: "Azure", contact_email: "", account_id: "", portal_url: "", is_active: true }])),
    );
    expect(html).toContain(`title="${cloud.action.editVendor}"`);
    for (const [panel, key] of [["ServicePanel", "editService"], ["PlanPanel", "editPlan"], ["CostPanel", "editBudget"], ["PricingPanel", "editRule"]]) {
      expect(body(panel)).toContain(`title={t("action.${key}")}`);
    }
  });

  it("(c) a refused save names the first field it refused", () => {
    expect(firstFieldError(new ApiError("x", 400, { usage_unit: "请选择有效的选项。" }))).toEqual({ key: "usage_unit", message: "请选择有效的选项。" });
    expect(firstFieldError(new ApiError("x", 409))).toBeNull();
    expect(body("SaveError")).toContain('t("saveFieldError", { field: label, error: field.message })');
  });

  it("(e) 预警 「内容」 is said from the alert's type and figures, not the English log line", () => {
    const html = text(render(<CloudServiceManagementWorkspace section="alerts" />, (qc) =>
      qc.setQueryData(["cloud-alerts", "paged"], page([{
        id: "al-1", service: "s-1", service_code: "CS-1", service_name: "Storage", company: null, company_name: null,
        project: null, project_name: null, alert_type: "COST_THRESHOLD", threshold: "80.00", current_value: "85.00",
        is_resolved: false, resolved_at: null, notification_sent_at: null,
        message: "Budget BUD-1 reached 80% of RM 100", created_at: "2026-11-16T08:00:00Z",
      }])),
    ));
    expect(html).toContain("成本预算预警：目前 85.00，预警线 80.00");
    expect(html).not.toContain("Budget BUD-1 reached");
  });

  it("(h) report columns of codes carry the screen's words", () => {
    for (const group of Object.values(REPORT_VALUE_GROUPS)) expect(cloud[group], group).toBeTypeOf("object");
    expect(body("ReportPanel")).toContain("...values(key)");
  });

  it("(i) 阶梯收费 shows its tiers box outside 高级技术设置, with an example", () => {
    const pricing = body("PricingDialog");
    const advanced = pricing.indexOf("<AdvancedTechnicalSettings>");
    const box = pricing.indexOf("data-tiers-box");
    expect(box).toBeGreaterThan(-1);
    expect(box).toBeLessThan(advanced);
    expect(pricing).toContain("{tiered && (");
    expect(pricing).toContain("placeholder={TIERS_EXAMPLE}");
  });
});
