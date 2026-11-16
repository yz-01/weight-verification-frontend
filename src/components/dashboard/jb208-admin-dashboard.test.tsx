/**
 * JB208 (Lucas 11-16 audit): the MSE Admin dashboard.
 *
 * JB208-1: Finance has no 平台监控, so the dashboard - every MSE Admin
 * account's first page - read 「无法加载平台仪表板。」. The server now opens
 * it to 公司管理 holders too; here, a part whose module the reader does not
 * hold is left out instead of erroring (系统状态) or linking somewhere that
 * bounces back.
 *
 * JB208-2: the figures and 待处理事项 linked to module addresses that dropped
 * the filter - 待审核申请 opened an empty 新增公司 form, 即将到期 opened 套餐管理.
 *
 * JB208-12: 快捷操作 only for the reader's own modules.
 *
 * Rendered to static markup (the runner has no DOM), with the dashboard's data
 * already in the query cache.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { AdminDashboardData } from "@/interfaces/platform-ops";
import type { AdminDashboardSection } from "@/lib/admin-dashboard";
import messages from "@/messages/zh.json";

const ALL_FEATURES = [
  "dashboard",
  "company_management",
  "user_management",
  "subscription_management",
  "billing_commission",
  "platform_monitoring",
  "cloud_weighing",
  "report_center",
  "notification_center",
  "platform_settings",
  "customer_service",
  "technical_support",
];
// accounts/role_templates.py PLATFORM_ROLE_TEMPLATES "platform_finance".
const FINANCE = {
  features: [
    "dashboard",
    "company_management",
    "subscription_management",
    "billing_commission",
    "report_center",
    "audit_log_center",
    "sales_commission",
    "partner_management",
    "cloud_service_management",
  ],
  permissions: ["company.view", "billing.view", "subscription.view", "report.view"],
};
const ADMIN = {
  features: ALL_FEATURES,
  permissions: ["company.view", "platform.monitor", "billing.view"],
};

const state = vi.hoisted(() => ({
  reader: { features: [] as string[], permissions: [] as string[] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/location-map", () => ({
  LocationMap: () => null,
}));
vi.mock("recharts", () => {
  const Empty = () => null;
  return {
    CartesianGrid: Empty,
    Legend: Empty,
    Line: Empty,
    LineChart: Empty,
    ResponsiveContainer: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", portal: "MSE_ADMIN", features: state.reader.features },
    can: (code: string) => state.reader.permissions.includes(code),
  }),
}));

const { AdminDashboard } = await import("@/components/dashboard/admin-dashboard");

const series = [{ month: "2026-11-01", value: 1 }];
const data = {
  generated_at: "2026-11-16T03:00:00Z",
  map: { markers: [], states: [] },
  platform: {
    companies: 3,
    contractors: 2,
    recyclers: 1,
    projects: 4,
    active_companies: 1,
    inactive_companies: 2,
    users: 7,
    online_users: 1,
    projects_by_status: {},
  },
  business_today: {
    orders: 1,
    completed_orders: 1,
    recovered_weight_kg: "10",
    settlement_amount: "100",
    service_commission: "5",
  },
  subscriptions: {
    active: 1,
    expiring_soon: 1,
    expired: 1,
    paused: 0,
    not_started: 0,
    renewed_today: 0,
    monthly_revenue: "500",
  },
  commission: {
    business_weight_kg: "10",
    settlement_amount: "100",
    receivable: "5",
    received: "0",
    outstanding: "5",
  },
  pending: {
    company_reviews: 2,
    contractor_reviews: 1,
    recycler_reviews: 1,
    payments: 3,
    system_exceptions: 4,
    customer_service: 5,
    support_tickets: 6,
  },
  weighing: {
    online_scales: 1,
    offline_scales: 0,
    today_sessions: 1,
    today_anomalies: 0,
    today_reweighs: 0,
    service_status: "ok",
  },
  system: {},
  notifications: [],
  trends: {
    companies: series,
    contractors: series,
    recyclers: series,
    orders: series,
    weight_kg: series,
    saas_revenue: series,
    commission_revenue: series,
  },
} as unknown as AdminDashboardData;

function render(who: typeof ADMIN, section?: AdminDashboardSection) {
  state.reader = who;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["admin-dashboard"], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <AdminDashboard section={section} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const unavailable = messages.dashboard.admin.sectionUnavailable;

describe("JB208 admin dashboard", () => {
  it("JB208-2: every figure and pending row opens its own page with its filter", () => {
    const html = render(ADMIN);
    for (const href of [
      "/companies/admin/review?type=CONTRACTOR",
      "/companies/admin/review?type=RECYCLER",
      "/billing/collections",
      "/monitoring/exceptions",
      "/customer-service/enquiries",
      "/support-tickets/tickets",
      "/companies/admin/directory?type=CONTRACTOR",
      "/companies/admin/directory?type=RECYCLER",
      "/companies/admin/projects",
      "/subscriptions/companies?state=EXPIRING_SOON",
      "/subscriptions/companies?state=EXPIRED",
      "/billing/search?kind=SAAS",
      "/billing/search?kind=COMMISSION",
      "/companies/admin/directory",
    ]) {
      expect(html, href).toContain(`href="${href.replace(/&/g, "&amp;")}"`);
    }
    // None of the module addresses that dropped the filter is left.
    for (const hub of [
      'href="/companies"',
      'href="/companies?',
      'href="/subscriptions"',
      'href="/subscriptions?',
      'href="/billing"',
      'href="/billing?',
      'href="/monitoring"',
      'href="/customer-service"',
    ]) {
      expect(html).not.toContain(hub);
    }
  });

  it("JB208-1: Finance sees its own parts and no error", () => {
    const html = render(FINANCE);
    expect(html).not.toContain(messages.dashboard.admin.error);
    expect(html).toContain(messages.dashboard.admin.section.subscriptions);
    expect(html).toContain(messages.dashboard.admin.section.commission);
    // 系统状态 needs 平台监控: left out rather than 「无法加载系统状态」.
    expect(html).not.toContain(messages.dashboard.admin.systemStatus.title);
    // Pending rows of modules Finance cannot open are left out...
    expect(html).toContain('href="/billing/collections"');
    expect(html).not.toContain('href="/monitoring/exceptions"');
    expect(html).not.toContain('href="/customer-service/enquiries"');
    expect(html).not.toContain('href="/support-tickets/tickets"');
    // ...and a figure from one (用户) is shown without a link.
    expect(html).toContain(messages.dashboard.admin.metric.users);
    expect(html).not.toContain('href="/users/admin/management"');
  });

  it("JB208-1: a part outside the reader's modules says so in words", () => {
    expect(render(FINANCE, "system-status")).toContain(unavailable);
    expect(render(ADMIN, "system-status")).not.toContain(unavailable);
  });

  it("JB208-1: an account that may not read the dashboard is told so, not shown an error", () => {
    const html = render({ features: ["dashboard"], permissions: [] });
    expect(html).toContain(unavailable);
    expect(html).not.toContain(messages.dashboard.admin.error);
  });

  it("JB208-12: quick actions only for the reader's modules", () => {
    const admin = render(ADMIN, "quick-actions");
    expect(admin).toContain('href="/users/admin/management"');
    expect(admin).toContain('href="/system-settings"');
    const finance = render(FINANCE, "quick-actions");
    expect(finance).toContain('href="/subscriptions/companies"');
    expect(finance).toContain('href="/billing/search"');
    expect(finance).not.toContain('href="/users/admin/management"');
    expect(finance).not.toContain('href="/system-settings"');
  });
});
