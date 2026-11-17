/**
 * JB213 walk 11-17 (findings-1117-B, step 11): with the package's 功能 list
 * narrowed to 回收场 / 废料订单 / 称重记录 on a plan without 云端称重引擎, the
 * recycler's 仪表板 met a red 「你没有权限做这件事。」 (the live-driver map asked
 * for 司机任务's data) and its 待处理事项 listed 扣重 / 待操作员确认 / 异常数,
 * whose pages the menu hides. The dashboard now uses the menu's own test:
 * nothing it hides is asked for or linked; with every menu open nothing
 * changes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const session = vi.hoisted(() => ({ features: [] as string[] }));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      portal: "MSE_SCRAP",
      features: session.features,
      is_superuser: false,
      permissions: [
        "dispatch.view", "weighing.view", "deduction.view", "deduction.create", "billing.view",
        "notification.view", "task.view", "outbound.view", "inventory.view",
      ],
    },
    // The yard filter has its own test (jb207w-dashboard-yards).
    canAny: () => false,
    can: () => true,
  }),
}));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), list: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/components/shared/location-map", () => ({ LocationMap: () => <div data-stub="map" /> }));

const { RecyclerDashboard } = await import("@/components/recycler-business/recycler-dashboard");

const DATA = {
  generated_at: "2026-11-18T00:00:00+08:00",
  date: "2026-11-18",
  site: { id: null, name: null, scoped: [], company_wide: [] },
  permissions: { orders: true, inventory: false, outbound: false, billing: true, notifications: true },
  business_today: {
    platform_orders: 1, waiting_acceptance: 2, pending_dispatch: 3, active_collections: 0, completed: 0, cancelled: 0,
  },
  recovery_today: null,
  inventory: null,
  outbound_today: null,
  pending: {
    waiting_acceptance: 2,
    pending_dispatch: 3,
    pending_deduction_confirmation: 4,
    weighing_confirmation: { available: true, count: 5 },
    weighing_anomalies: { available: true, count: 6 },
    open_saas_invoices: 1,
    open_commission_invoices: null,
  },
  fees: null,
  notifications: [],
  charts: null,
  recent: { orders: [], recoveries: [], outbound: [], invoices: [], notifications: [] },
};

/** What the walk's package left in the menu (称重记录 ticked, hidden by 云端称重). */
const NARROWED = [
  "dashboard", "yards", "waste_orders", "billing_commission", "notifications",
  "users", "roles", "company_settings", "user_logs", "activity_logs",
];
const EVERYTHING = [
  "dashboard", "partnerships", "customer_management", "yards", "weighbridges", "vehicles", "drivers",
  "waste_orders", "driver_tasks", "driver_gps", "weighing_records", "inventory_management",
  "outbound_management", "payment_status", "billing_commission", "transaction_reports", "documents",
  "approvals", "evidence", "notifications", "users", "roles", "integrations", "company_settings",
  "user_logs", "activity_logs",
];

function dashboard(features: string[]) {
  session.features = features;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["recycler-dashboard", "__all__"], DATA);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <RecyclerDashboard features={features} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the recycler 仪表板 on a narrowed package (walk 11-17)", () => {
  it("does not draw the live-driver map, whose data a hidden menu owns", () => {
    expect(dashboard(NARROWED)).not.toContain("recycler-live-drivers-title");
  });

  it("lists no to-do whose page is hidden, and keeps the ones that open", () => {
    const html = dashboard(NARROWED);
    expect(html).not.toContain(zh.reports.transaction.deductions);
    expect(html).not.toContain(zh.weighing.ticketStatus.PENDING_CONFIRMATION);
    expect(html).not.toContain(zh.weighing.field.anomalyCount);
    expect(html).not.toContain('href="/weighing"');
    expect(html).not.toContain('href="/deductions"');
    expect(html).toContain(zh.dashboard.admin.pending.title);
    expect(html).toContain('href="/waste-orders?state=ACCEPTED"');
    expect(html).toContain(zh.billing.kind.SAAS);
  });

  it("leaves the recent list of a hidden page out", () => {
    const html = dashboard(NARROWED);
    expect(html).not.toContain('href="/recycler-outbound"');
    expect(html).toContain(zh.dashboard.tile.wasteOrders);
  });
});

describe("the recycler 仪表板 with every menu open", () => {
  it("is as before: the map, every to-do and every recent list", () => {
    const html = dashboard(EVERYTHING);
    expect(html).toContain("recycler-live-drivers-title");
    expect(html).toContain(zh.reports.transaction.deductions);
    expect(html).toContain(zh.weighing.ticketStatus.PENDING_CONFIRMATION);
    expect(html).toContain(zh.weighing.field.anomalyCount);
    expect(html).toContain('href="/weighing"');
    expect(html).toContain('href="/deductions"');
    expect(html).toContain('href="/recycler-outbound"');
    expect(html).toContain('href="/billing"');
    expect(html).toContain('href="/notifications"');
  });
});
