/**
 * JB212 (Lucas 11-16 「把它们真的做出来」 / 「要站在老人家的角度去思考」): the
 * 系统设置 rows that saved and did nothing now have editors that say what they
 * do, in place of JSON boxes and free text.
 *
 * - 11.2.10 通知设置: six ticks for 「启用的通知类别」, one number for
 *   「订阅到期前几天开始提醒」 (JB212-1, JB212-2);
 * - 11.2.7 二维码设置: one number for 「多少秒内再扫算重复使用」 (JB212-3);
 * - 11.2.3 佣金设置: the platform default rule that bills use, with 「修改」
 *   and a way to all versions; the four copies are gone (JB212-4);
 * - 11.2.2 SaaS 设置: 「默认配套」 is a list of builder plans; 「启用配套」 is
 *   gone (Lucas Q4 = A, JB212-5);
 * - 11.2.11 维护设置: date-and-time pickers that refuse an end before the
 *   start (JB212-6).
 *
 * Rendered to static markup (the runner has no DOM) from a seeded catalogue.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1" }, can: () => true, refresh: vi.fn() }),
}));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), list: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/system-settings",
  useSearchParams: () => new URLSearchParams(),
}));

const { SystemSettingsWorkspace } = await import(
  "@/components/platform-settings/system-settings-workspace"
);
const { DEFAULT_PLAN_OPTIONS_KEY } = await import(
  "@/components/platform-settings/system-settings-workspace"
);
const { PLATFORM_DEFAULT_COMMISSION_KEY } = await import(
  "@/components/billing/commission-rule-manager"
);

type Row = [key: string, group: string, type: string, value: string];

const ROWS: Row[] = [
  ["saas.default_billing_cycle", "saas", "STRING", "MONTHLY"],
  ["saas.default_trial_days", "saas", "INTEGER", "0"],
  ["saas.default_user_limit", "saas", "INTEGER", "5"],
  ["saas.default_plan_code", "saas", "STRING", "CT-OLD"],
  ["commission.enabled", "commission", "BOOLEAN", "true"],
  ["qr.duplicate_use_policy", "qr", "STRING", "REJECT"],
  ["qr.anomaly_rules", "qr", "JSON", '{"duplicate_window_seconds": 45}'],
  ["notification.in_app.enabled", "notifications", "BOOLEAN", "true"],
  ["notification.enabled_types", "notifications", "JSON", '["COMPANY", "CWE"]'],
  ["notification.automatic_rules", "notifications", "JSON", '{"subscription_reminder_days": 14}'],
  ["maintenance.enabled", "maintenance", "BOOLEAN", "false"],
  ["maintenance.starts_at", "maintenance", "STRING", "2026-12-01T22:00:00+08:00"],
  ["maintenance.ends_at", "maintenance", "STRING", "2026-12-01T21:00:00+08:00"],
  ["maintenance.notice", "maintenance", "STRING", ""],
];

const CATALOGUE = {
  groups: ["saas", "commission", "qr", "notifications", "maintenance"],
  configs: ROWS.map(([key, group, value_type, value]) => ({
    key,
    group,
    value_type,
    default_value: value,
    value,
    typed_value: value,
    description: key,
    is_public: false,
    is_readonly: false,
    is_required: true,
    updated_at: null,
  })),
  credentials: {
    api_gateway: { configured: false, source: "DEPLOYMENT_ENV" },
    email: { configured: false, source: "DEPLOYMENT_ENV" },
    push: { configured: false, source: "DEPLOYMENT_ENV" },
  },
  branding: { name: "MSE Trace", icon_url: null },
};

const RULE = {
  id: "r1",
  name: "平台默认",
  company: null,
  company_name: null,
  basis: "SETTLED_AMOUNT",
  rate: "2.500",
  cycle: "MONTHLY",
  payment_term_days: 30,
  minimum_amount: "0.00",
  maximum_amount: null,
  effective_from: "2026-01-01",
  effective_to: null,
  notes: "",
  is_active: true,
  invoice_count: 3,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function render(
  section: "saas" | "commission" | "qr" | "notifications" | "maintenance",
  commission: unknown = {
    commission_enabled: true,
    in_force: RULE,
    next: { ...RULE, id: "r2", rate: "3.000", effective_from: "2027-01-01" },
  },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["platform-config-catalogue"], CATALOGUE);
  client.setQueryData(PLATFORM_DEFAULT_COMMISSION_KEY, commission);
  client.setQueryData(DEFAULT_PLAN_OPTIONS_KEY, {
    count: 2,
    next: null,
    previous: null,
    results: [
      { id: "p1", code: "CT-BASIC", name: "建筑商基本", audience: "CONTRACTOR", is_active: true },
      { id: "p2", code: "CT-PRO", name: "建筑商专业", audience: "CONTRACTOR", is_active: true },
    ],
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <SystemSettingsWorkspace section={section} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const s = zh.adminSystemSettings;

describe("通知设置 (JB212-1, JB212-2)", () => {
  it("shows six ticks with plain names instead of a JSON box", () => {
    const html = render("notifications");
    expect(html).not.toMatch(/<textarea[^>]*id="notification\.enabled_types"/);
    const ticks = [...html.matchAll(/data-notification-type="([A-Z_]+)"/g)].map((m) => m[1]);
    expect(ticks).toEqual(["COMPANY", "SUBSCRIPTION", "SAAS_BILLING", "COMMISSION_BILLING", "CWE", "SYSTEM"]);
    for (const code of ["COMPANY", "SUBSCRIPTION", "SAAS_BILLING", "COMMISSION_BILLING", "CWE", "SYSTEM"] as const) {
      expect(html).toContain(s.notificationTypes[code].label);
    }
    // The saved ticks: 公司 and 地磅 on, the rest off.
    expect(html).toMatch(/data-notification-type="COMPANY"[^>]*checked/);
    expect(html).toMatch(/data-notification-type="CWE"[^>]*checked/);
    expect(html).not.toMatch(/data-notification-type="SUBSCRIPTION"[^>]*checked/);
    // Turning off SaaS bills also stops the tenant's 「账单已开出」 - said on the tick.
    expect(html).toContain(s.notificationTypes.SAAS_BILLING.help);
  });

  it("asks for the reminder as a number of days, saved value shown", () => {
    const html = render("notifications");
    expect(html).not.toMatch(/<textarea[^>]*id="notification\.automatic_rules"/);
    expect(html).toMatch(/<input[^>]*id="notification\.automatic_rules"[^>]*type="number"|<input[^>]*type="number"[^>]*id="notification\.automatic_rules"/);
    expect(html).toMatch(/id="notification\.automatic_rules"[^>]*value="14"|value="14"[^>]*id="notification\.automatic_rules"/);
    expect(html).toContain(s.reminderDays.before);
  });
});

describe("二维码设置 (JB212-3)", () => {
  it("asks for the 重复使用 window in seconds", () => {
    const html = render("qr");
    expect(html).not.toMatch(/<textarea[^>]*id="qr\.anomaly_rules"/);
    expect(html).toMatch(/id="qr\.anomaly_rules"[^>]*value="45"|value="45"[^>]*id="qr\.anomaly_rules"/);
    expect(html).toContain(s.duplicateWindow.before);
  });
});

describe("佣金设置 (JB212-4)", () => {
  it("shows the platform default rule bills use, its next version, 修改 and the way to every version", () => {
    const html = render("commission");
    expect(html).toContain('data-commission-card="platform-default"');
    expect(html).toContain("2.500%");
    expect(html).toContain(zh.billing.basis.SETTLED_AMOUNT);
    expect(html).toContain(zh.billing.cycle.MONTHLY);
    expect(html).toContain("3.000%");
    expect(html).toContain(s.commissionCard.change);
    expect(html).toContain('href="/billing/commission-rules"');
    // The switch stays; the four copies do not come back.
    expect(html).toContain(s.field.commission_enabled);
    expect(html).not.toContain(s.field.commission_default_rate);
  });

  it("says plainly when there is no platform rule yet, and what saving one starts", () => {
    const html = render("commission", { commission_enabled: true, in_force: null, next: null });
    expect(html).toContain(s.commissionCard.none);
    expect(html).toContain(s.commissionCard.set);
  });

  it("says when 启用佣金 is off", () => {
    const html = render("commission", { commission_enabled: false, in_force: RULE, next: null });
    expect(html).toContain(s.commissionCard.switchedOff);
  });
});

describe("SaaS 设置 (JB212-5)", () => {
  it("chooses the default plan from the builder plans, and keeps a stopped one visible", () => {
    const html = render("saas");
    expect(html).toMatch(/<select[^>]*id="saas\.default_plan_code"/);
    expect(html).toContain("CT-BASIC");
    expect(html).toContain("建筑商专业");
    expect(html).toContain(s.defaultPlan.none);
    // CT-OLD is saved but no longer an active builder plan: shown, not swapped.
    expect(html).toContain("CT-OLD");
    expect(html).toContain(s.defaultPlan.stopped.replace("{code}", "CT-OLD"));
    expect(html).not.toContain(s.field.saas_plans_enabled);
  });
});

describe("维护设置 (JB212-6)", () => {
  it("picks the times with date-and-time pickers in office time", () => {
    const html = render("maintenance");
    expect(html).toMatch(/<input[^>]*type="datetime-local"/);
    expect(html).toMatch(/value="2026-12-01T22:00"/);
    expect(html).toMatch(/value="2026-12-01T21:00"/);
    expect(html).toContain(s.maintenanceWindow.startBlank);
    expect(html).toContain(s.maintenanceWindow.endBlank);
  });

  it("refuses an end before the start, saying why", () => {
    const html = render("maintenance");
    expect(html).toContain(s.maintenanceWindow.endBeforeStart);
  });
});
