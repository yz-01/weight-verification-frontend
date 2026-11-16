"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  MapPinned,
  Receipt,
  Recycle,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  FileText,
  Users,
  Weight,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "@/components/providers/auth-provider";
import {
  LocationMap,
  type LocationMapMarker,
} from "@/components/shared/location-map";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AdminDashboardData,
  AdminDashboardMarker,
  NotificationRow,
} from "@/interfaces/platform-ops";
import type { AdminDashboardSection } from "@/lib/admin-dashboard";
import { useDateFormat } from "@/lib/dates";
import {
  getAdminDashboard,
  getMonitoringOverview,
} from "@/services/platform-ops.service";

type NumericValue = number | string;

interface Metric {
  key: string;
  value: NumericValue;
  href: string;
  /** The module `href` belongs to; a reader without it gets no link. */
  feature: string;
  icon: typeof Building2;
  format?: "number" | "weight" | "currency";
  tone?: "default" | "warning" | "danger";
}

/**
 * Which MSE Admin module each part of the dashboard belongs to (JB208-1,
 * Lucas 11-16 audit). The dashboard is every account's first page, so a part
 * whose module the reader does not hold is left out - rather than shown as
 * 「无法加载系统状态」 (系统状态 needs 平台监控, which Finance does not hold)
 * or as figures whose links bounce back here. Parts not listed are for
 * everyone who can open the dashboard.
 */
export const ADMIN_DASHBOARD_SECTION_FEATURE: Partial<
  Record<AdminDashboardSection, string>
> = {
  map: "company_management",
  platform: "company_management",
  subscriptions: "subscription_management",
  commission: "billing_commission",
  cwe: "cloud_weighing",
  notifications: "notification_center",
  "system-status": "platform_monitoring",
};

export function adminDashboardSectionVisible(
  section: AdminDashboardSection,
  features: ReadonlySet<string>,
): boolean {
  const feature = ADMIN_DASHBOARD_SECTION_FEATURE[section];
  return feature === undefined || features.has(feature);
}

/**
 * 待处理事项. Each row opens the page that lists exactly what it counts
 * (JB208-2): the module addresses dropped the filter and opened the module's
 * first page - 待审核申请 opened an empty 新增公司 form. A row whose module
 * the reader does not hold is left out (JB208-1).
 */
export const ADMIN_PENDING_LINKS = [
  {
    key: "contractorReviews",
    count: "contractor_reviews",
    href: "/companies/admin/review?type=CONTRACTOR",
    feature: "company_management",
  },
  {
    key: "recyclerReviews",
    count: "recycler_reviews",
    href: "/companies/admin/review?type=RECYCLER",
    feature: "company_management",
  },
  {
    key: "payments",
    count: "payments",
    href: "/billing/collections",
    feature: "billing_commission",
  },
  {
    key: "systemExceptions",
    count: "system_exceptions",
    href: "/monitoring/exceptions",
    feature: "platform_monitoring",
  },
  {
    key: "customerService",
    count: "customer_service",
    href: "/customer-service/enquiries",
    feature: "customer_service",
  },
  {
    key: "supportTickets",
    count: "support_tickets",
    href: "/support-tickets/tickets",
    feature: "technical_support",
  },
] as const;

/**
 * 快捷操作, each to a concrete page (JB208-2) and only for the reader's own
 * modules (JB208-12): a Support Agent pressing 订阅管理 was sent back here
 * without a word.
 */
export const ADMIN_QUICK_ACTIONS = [
  {
    key: "companies",
    href: "/companies/admin/directory",
    icon: Building2,
    feature: "company_management",
  },
  {
    key: "users",
    href: "/users/admin/management",
    icon: Users,
    feature: "user_management",
  },
  {
    key: "subscriptions",
    href: "/subscriptions/companies",
    icon: CreditCard,
    feature: "subscription_management",
  },
  {
    key: "billing",
    href: "/billing/search",
    icon: Receipt,
    feature: "billing_commission",
  },
  { key: "reports", href: "/reports", icon: FileText, feature: "report_center" },
  {
    key: "settings",
    href: "/system-settings",
    icon: Settings,
    feature: "platform_settings",
  },
] as const;

export function AdminDashboard({
  section,
}: {
  section?: AdminDashboardSection;
}) {
  const t = useTranslations("dashboard.admin");
  const common = useTranslations("common");
  const df = useDateFormat();
  const format = useFormatter();
  const { user, can } = useAuth();
  const features = useMemo(
    () => new Set<string>(user?.features ?? []),
    [user?.features],
  );
  const [search, setSearch] = useState("");
  const [state, setState] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [contractor, setContractor] = useState("ALL");
  const [recycler, setRecycler] = useState("ALL");
  const [projectStatus, setProjectStatus] = useState("ALL");
  // JB208-1: the server opens the dashboard to 平台监控 or 公司管理 holders.
  const canLoad = can("platform.monitor") || can("company.view");
  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getAdminDashboard,
    enabled: canLoad,
    refetchInterval: 60_000,
  });
  const show = (target: AdminDashboardSection) =>
    (section === undefined || section === target) &&
    adminDashboardSectionVisible(target, features);
  const monitoring = useQuery({
    queryKey: ["monitoring", "dashboard-system-status"],
    queryFn: getMonitoringOverview,
    enabled: show("system-status"),
    refetchInterval: 30_000,
  });

  const data = dashboard.data;
  const markers = useMemo(
    () =>
      filterMarkers(data?.map.markers ?? [], {
        search,
        state,
        kind,
        contractor,
        recycler,
        projectStatus,
      }),
    [
      contractor,
      data?.map.markers,
      kind,
      projectStatus,
      recycler,
      search,
      state,
    ],
  );
  const mapMarkers = useMemo<LocationMapMarker[]>(
    () => markers.map((marker) => toMapMarker(marker, t)),
    [markers, t],
  );

  // JB208-1: a part of the dashboard outside the reader's modules, or an
  // account that may not read the dashboard at all (no role yet), is told so
  // in words rather than shown 「无法加载平台仪表板。」.
  if (
    !canLoad ||
    (section !== undefined && !adminDashboardSectionVisible(section, features))
  ) {
    return (
      <div className="border-y py-12 text-center text-sm text-muted-foreground">
        {t("sectionUnavailable")}
      </div>
    );
  }
  if (dashboard.isError) {
    return (
      <div className="border-y py-12 text-center text-sm text-muted-foreground">
        {t("error")}
      </div>
    );
  }
  if (!data) return <AdminDashboardSkeleton />;

  // JB208-2: every figure opens the page that lists it, with its filter. The
  // module addresses (`/companies?type=…`, `/subscriptions?state=…`,
  // `/billing?kind=…`) dropped the filter and opened the module's first page.
  const platformMetrics: Metric[] = [
    {
      key: "contractors",
      value: data.platform.contractors,
      href: "/companies/admin/directory?type=CONTRACTOR",
      feature: "company_management",
      icon: Building2,
    },
    {
      key: "recyclers",
      value: data.platform.recyclers,
      href: "/companies/admin/directory?type=RECYCLER",
      feature: "company_management",
      icon: Recycle,
    },
    {
      key: "projects",
      value: data.platform.projects,
      href: "/companies/admin/projects",
      feature: "company_management",
      icon: MapPinned,
    },
    {
      key: "users",
      value: data.platform.users,
      href: "/users/admin/management",
      feature: "user_management",
      icon: Users,
    },
    {
      key: "onlineUsers",
      value: data.platform.online_users,
      href: "/users/admin/management",
      feature: "user_management",
      icon: CheckCircle2,
    },
  ];
  const businessMetrics: Metric[] = [
    {
      key: "orders",
      value: data.business_today.orders,
      href: "/reports",
      feature: "report_center",
      icon: Receipt,
    },
    {
      key: "completedOrders",
      value: data.business_today.completed_orders,
      href: "/reports",
      feature: "report_center",
      icon: ClipboardCheck,
    },
    {
      key: "recoveredWeight",
      value: data.business_today.recovered_weight_kg,
      href: "/weighing",
      feature: "cloud_weighing",
      icon: Weight,
      format: "weight",
    },
    {
      key: "settlementAmount",
      value: data.business_today.settlement_amount,
      href: "/billing/search?kind=COMMISSION",
      feature: "billing_commission",
      icon: CircleDollarSign,
      format: "currency",
    },
    {
      key: "serviceCommission",
      value: data.business_today.service_commission,
      href: "/billing/search?kind=COMMISSION",
      feature: "billing_commission",
      icon: CreditCard,
      format: "currency",
    },
  ];
  const subscriptionMetrics: Metric[] = [
    {
      key: "activeSubscriptions",
      value: data.subscriptions.active,
      href: "/subscriptions/companies?state=ACTIVE",
      feature: "subscription_management",
      icon: CheckCircle2,
    },
    {
      key: "expiringSubscriptions",
      value: data.subscriptions.expiring_soon,
      href: "/subscriptions/companies?state=EXPIRING_SOON",
      feature: "subscription_management",
      icon: AlertTriangle,
      tone: "warning",
    },
    {
      key: "expiredSubscriptions",
      value: data.subscriptions.expired,
      href: "/subscriptions/companies?state=EXPIRED",
      feature: "subscription_management",
      icon: AlertTriangle,
      tone: "danger",
    },
    {
      key: "renewedToday",
      value: data.subscriptions.renewed_today,
      href: "/subscriptions/companies",
      feature: "subscription_management",
      icon: CreditCard,
    },
    {
      key: "monthlySaasRevenue",
      value: data.subscriptions.monthly_revenue,
      href: "/billing/search?kind=SAAS",
      feature: "billing_commission",
      icon: CircleDollarSign,
      format: "currency",
    },
  ];
  const commissionMetrics: Metric[] = [
    {
      key: "commissionWeight",
      value: data.commission.business_weight_kg,
      href: "/billing/search?kind=COMMISSION",
      feature: "billing_commission",
      icon: Weight,
      format: "weight",
    },
    {
      key: "commissionSettlement",
      value: data.commission.settlement_amount,
      href: "/billing/search?kind=COMMISSION",
      feature: "billing_commission",
      icon: Receipt,
      format: "currency",
    },
    {
      key: "commissionReceivable",
      value: data.commission.receivable,
      href: "/billing/search?kind=COMMISSION",
      feature: "billing_commission",
      icon: CreditCard,
      format: "currency",
    },
    {
      key: "commissionReceived",
      value: data.commission.received,
      href: "/billing/search?kind=COMMISSION",
      feature: "billing_commission",
      icon: CheckCircle2,
      format: "currency",
    },
    {
      key: "commissionOutstanding",
      value: data.commission.outstanding,
      href: "/billing/search?kind=COMMISSION",
      feature: "billing_commission",
      icon: AlertTriangle,
      format: "currency",
      tone: Number(data.commission.outstanding) > 0 ? "warning" : "default",
    },
  ];
  const trendRows = combineTrends(data);
  const projectStatusOptions = uniqueSorted(
    data.map.markers
      .filter((marker) => marker.kind === "PROJECT")
      .map((marker) => marker.status),
  );
  const contractorOptions = uniqueCompanies(
    data.map.markers.filter((marker) => marker.company_type === "CONTRACTOR"),
  );
  const recyclerOptions = uniqueCompanies(
    data.map.markers.filter((marker) => marker.company_type === "RECYCLER"),
  );
  const markerCounts = countMarkerKinds(markers);
  const coverage = data.map.coverage;
  const missingLocations = coverage
    ? Object.values(coverage).reduce((total, item) => total + item.missing, 0)
    : 0;
  const hasMapFilters =
    [state, kind, contractor, recycler, projectStatus].some(
      (value) => value !== "ALL",
    ) || Boolean(search.trim());
  const resetMapFilters = () => {
    setSearch("");
    setState("ALL");
    setKind("ALL");
    setContractor("ALL");
    setRecycler("ALL");
    setProjectStatus("ALL");
  };

  return (
    <div className="space-y-8">
      {section === undefined && (
        <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-primary">
              MSE Trace
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("updatedAt", { value: df.dateTime(data.generated_at) })}
          </p>
        </header>
      )}
      {section === undefined && (
        <div className="grid gap-6 xl:grid-cols-2" data-dashboard-priority>
          <AdminPendingPanel
            pending={data.pending}
            features={features}
            title={t("pending.title")}
            labels={{
              contractorReviews: t("pending.contractorReviews"),
              recyclerReviews: t("pending.recyclerReviews"),
              payments: t("pending.payments"),
              systemExceptions: t("pending.systemExceptions"),
              customerService: t("pending.customerService"),
              supportTickets: t("pending.supportTickets"),
            }}
          />
          {show("notifications") && (
            <AdminNotificationsPanel
              notifications={data.notifications}
              title={t("notifications.title")}
              viewAll={t("notifications.viewAll")}
              empty={t("notifications.empty")}
            />
          )}
        </div>
      )}
      {show("map") && (
        <section
          className="overflow-hidden surface-panel rounded-xl"
          aria-labelledby="admin-map-title"
        >
          <div className="flex flex-col gap-4 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                <MapPinned className="size-5" />
              </span>
              <div>
                <h2 id="admin-map-title" className="text-base font-semibold">
                  {t("map.title")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("map.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <MapLegend
                icon={MapPinned}
                label={t("map.kindValue.PROJECT")}
                value={markerCounts.PROJECT}
                tone="primary"
              />
              <MapLegend
                icon={Recycle}
                label={t("map.kindValue.RECYCLER")}
                value={markerCounts.RECYCLER}
                tone="positive"
              />
              <MapLegend
                icon={Weight}
                label={t("map.kindValue.SCALE")}
                value={markerCounts.SCALE}
                tone="warning"
              />
              <MapLegend
                icon={Building2}
                label={t("map.kindValue.HEADQUARTERS")}
                value={markerCounts.HEADQUARTERS}
                tone="neutral"
              />
            </div>
          </div>
          <div className="border-b bg-muted/20 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <SlidersHorizontal className="size-3.5" />
                {t("map.filters")}
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabledReason={
                  !hasMapFilters ? common("noFiltersSet") : undefined
                }
                disabled={!hasMapFilters}
                onClick={resetMapFilters}
              >
                <RotateCcw />
                {t("map.reset")}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MapFilter label={t("map.search")}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("map.searchPlaceholder")}
                    className="bg-background pl-9"
                  />
                </div>
              </MapFilter>
              <MapFilter label={t("map.state")}>
                <MapSelect
                  value={state}
                  onChange={setState}
                  label={t("map.state")}
                  options={data.map.states.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  allLabel={t("map.allStates")}
                />
              </MapFilter>
              <MapFilter label={t("map.contractor")}>
                <MapSelect
                  value={contractor}
                  onChange={(value) => {
                    setContractor(value);
                    if (value !== "ALL" && recycler !== "ALL") setRecycler("ALL");
                  }}
                  label={t("map.contractor")}
                  options={contractorOptions}
                  allLabel={t("map.allContractors")}
                />
              </MapFilter>
              <MapFilter label={t("map.recycler")}>
                <MapSelect
                  value={recycler}
                  onChange={(value) => {
                    setRecycler(value);
                    if (value !== "ALL" && contractor !== "ALL") setContractor("ALL");
                  }}
                  label={t("map.recycler")}
                  options={recyclerOptions}
                  allLabel={t("map.allRecyclers")}
                />
              </MapFilter>
              <MapFilter label={t("map.projectStatus")}>
                <MapSelect
                  value={projectStatus}
                  onChange={setProjectStatus}
                  label={t("map.projectStatus")}
                  options={projectStatusOptions.map((item) => ({
                    value: item,
                    label: t(`map.statusValue.${item}`),
                  }))}
                  allLabel={t("map.allStatuses")}
                />
              </MapFilter>
              <MapFilter label={t("map.kind")}>
                <MapSelect
                  value={kind}
                  onChange={setKind}
                  label={t("map.kind")}
                  options={(
                    ["PROJECT", "RECYCLER", "SCALE", "HEADQUARTERS"] as const
                  ).map((item) => ({
                    value: item,
                    label: t(`map.kindValue.${item}`),
                  }))}
                  allLabel={t("map.allKinds")}
                />
              </MapFilter>
            </div>
          </div>
          <LocationMap
            center={[4.2105, 101.9758]}
            markers={mapMarkers}
            className="min-h-[30rem] border-0"
          />
          <div className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              {t("map.visible", {
                visible: markers.length,
                total: data.map.markers.length,
              })}
            </p>
            {markers.length === 0 && (
              <p className="font-medium text-warning">{t("map.noMatches")}</p>
            )}
          </div>
          {missingLocations > 0 && coverage && (
            <div className="border-t border-warning/25 bg-warning/10 px-4 py-3 text-xs text-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <div>
                  <p className="font-semibold">
                    {t("map.missingTitle", { count: missingLocations })}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t("map.missingDescription", {
                      projects: coverage.PROJECT.missing,
                      recyclers: coverage.RECYCLER.missing,
                      scales: coverage.SCALE.missing,
                      headquarters: coverage.HEADQUARTERS.missing,
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {show("platform") && (
        <MetricSection
          title={t("section.platform")}
          metrics={platformMetrics}
          features={features}
          t={t}
          format={format}
        />
      )}
      {show("business") && (
        <MetricSection
          title={t("section.businessToday")}
          metrics={businessMetrics}
          features={features}
          t={t}
          format={format}
        />
      )}
      {show("subscriptions") && (
        <MetricSection
          title={t("section.subscriptions")}
          metrics={subscriptionMetrics}
          features={features}
          t={t}
          format={format}
        />
      )}
      {show("commission") && (
        <MetricSection
          title={t("section.commission")}
          metrics={commissionMetrics}
          features={features}
          t={t}
          format={format}
        />
      )}

      {(show("trends") || (section !== undefined && show("pending"))) && (
        <div
          className={`grid gap-8 ${section === undefined ? "xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]" : ""}`}
        >
          {show("trends") && (
            <div className="min-w-0 space-y-8">
              <section
                className="space-y-3"
                aria-labelledby="admin-operating-trends-title"
              >
                <h2
                  id="admin-operating-trends-title"
                  className="text-base font-semibold"
                >
                  {t("trends.operatingTitle")}
                </h2>
                <div className="h-80 surface-panel rounded-xl p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendRows}
                      margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tickLine={false} axisLine={false} width={44} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="contractors"
                        name={t("trends.contractors")}
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="recyclers"
                        name={t("trends.recyclers")}
                        stroke="var(--chart-7)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        name={t("trends.orders")}
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        name={t("trends.weight")}
                        stroke="var(--chart-4)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section
                className="space-y-3"
                aria-labelledby="admin-revenue-trends-title"
              >
                <h2
                  id="admin-revenue-trends-title"
                  className="text-base font-semibold"
                >
                  {t("trends.revenueTitle")}
                </h2>
                <div className="h-72 surface-panel rounded-xl p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendRows}
                      margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tickLine={false} axisLine={false} width={44} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="saasRevenue"
                        name={t("trends.saasRevenue")}
                        stroke="var(--chart-3)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="commissionRevenue"
                        name={t("trends.commissionRevenue")}
                        stroke="var(--chart-5)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          )}

          {section !== undefined && show("pending") && (
            <AdminPendingPanel
              pending={data.pending}
              features={features}
              title={t("pending.title")}
              labels={{
                contractorReviews: t("pending.contractorReviews"),
                recyclerReviews: t("pending.recyclerReviews"),
                payments: t("pending.payments"),
                systemExceptions: t("pending.systemExceptions"),
                customerService: t("pending.customerService"),
                supportTickets: t("pending.supportTickets"),
              }}
            />
          )}
        </div>
      )}

      {(show("cwe") || (section !== undefined && show("notifications"))) && (
        <div
          className={`grid gap-8 ${section === undefined ? "xl:grid-cols-2" : ""}`}
        >
          {show("cwe") && (
            <section className="space-y-3" aria-labelledby="admin-cwe-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="admin-cwe-title" className="text-base font-semibold">
                  {t("weighing.title")}
                </h2>
                <StatusBadge
                  label={t(`health.${data.weighing.service_status}`)}
                  tone={healthTone(data.weighing.service_status)}
                />
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
                {(
                  [
                    "online_scales",
                    "offline_scales",
                    "today_sessions",
                    "today_anomalies",
                    "today_reweighs",
                  ] as const
                ).map((key) => (
                  <div key={key} className="min-h-24 bg-card p-4">
                    <p className="text-xs text-muted-foreground">
                      {t(`weighing.${key}`)}
                    </p>
                    <p className="mt-3 text-2xl font-semibold tabular-nums">
                      {format.number(data.weighing[key])}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {section !== undefined && show("notifications") && (
            <AdminNotificationsPanel
              notifications={data.notifications}
              title={t("notifications.title")}
              viewAll={t("notifications.viewAll")}
              empty={t("notifications.empty")}
            />
          )}
        </div>
      )}

      {show("quick-actions") && (
        <section
          className="space-y-3"
          aria-labelledby="admin-quick-actions-title"
        >
          <h2
            id="admin-quick-actions-title"
            className="text-base font-semibold"
          >
            {t("quickActions.title")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ADMIN_QUICK_ACTIONS.filter((action) =>
              features.has(action.feature),
            ).map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  className="flex min-h-16 items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-sm transition hover:border-primary/30 hover:text-primary hover:shadow-md"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {t(`quickActions.${action.key}`)}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {show("system-status") && (
        <section
          className="space-y-3"
          aria-labelledby="admin-system-status-title"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="admin-system-status-title"
              className="text-base font-semibold"
            >
              {t("systemStatus.title")}
            </h2>
            {monitoring.data && (
              <span className="text-xs text-muted-foreground">
                {t("updatedAt", {
                  value: df.dateTime(monitoring.data.generated_at),
                })}
              </span>
            )}
          </div>
          {monitoring.isError ? (
            <p className="border-y py-8 text-center text-sm text-muted-foreground">
              {t("systemStatus.error")}
            </p>
          ) : !monitoring.data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-3">
              {monitoring.data.services.map((service) => (
                <div key={service.key} className="min-h-24 bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{service.name}</p>
                    <StatusBadge
                      label={t(`health.${service.status}`)}
                      tone={healthTone(service.status)}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{t(`systemStatus.mode.${service.mode}`)}</span>
                    <span>
                      {t("systemStatus.failures", {
                        value: service.failures_24h,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MetricSection({
  title,
  metrics,
  features,
  t,
  format,
}: {
  title: string;
  metrics: Metric[];
  features: ReadonlySet<string>;
  t: ReturnType<typeof useTranslations<"dashboard.admin">>;
  format: ReturnType<typeof useFormatter>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t(`metric.${metric.key}`)}
                </p>
                <span
                  className={`grid size-8 place-items-center rounded-md ${metric.tone === "danger" ? "bg-destructive/10 text-destructive" : metric.tone === "warning" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold tabular-nums">
                {formatMetric(metric.value, metric.format, format, t)}
              </p>
            </>
          );
          // JB208-1: a figure from a module the reader does not hold is shown
          // but is not a link - its page would only send them back here.
          if (!features.has(metric.feature)) {
            return (
              <div key={metric.key} className="min-h-28 surface-panel rounded-xl p-4">
                {body}
              </div>
            );
          }
          return (
            <Link
              key={metric.key}
              href={metric.href}
              className="min-h-28 surface-panel rounded-xl p-4 transition hover:border-primary/30 hover:shadow-md"
            >
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function AdminPendingPanel({
  pending,
  features,
  title,
  labels,
}: {
  pending: AdminDashboardData["pending"];
  features: ReadonlySet<string>;
  title: string;
  labels: Record<(typeof ADMIN_PENDING_LINKS)[number]["key"], string>;
}) {
  return (
    <section className="space-y-3" aria-labelledby="admin-pending-title">
      <h2 id="admin-pending-title" className="text-base font-semibold">{title}</h2>
      <div className="divide-y rounded-lg border bg-card px-4 shadow-sm">
        {ADMIN_PENDING_LINKS.filter((row) => features.has(row.feature)).map((row) => (
          <PendingLink key={row.key} href={row.href} label={labels[row.key]} value={pending[row.count]} />
        ))}
      </div>
    </section>
  );
}

function adminNotificationHref(notification: NotificationRow): string {
  const rawHref = notification.data.href ?? notification.data.url;
  return typeof rawHref === "string" && rawHref.startsWith("/")
    ? rawHref
    : "/notifications/search";
}

function AdminNotificationsPanel({
  notifications,
  title,
  viewAll,
  empty,
}: {
  notifications: NotificationRow[];
  title: string;
  viewAll: string;
  empty: string;
}) {
  return (
    <section className="space-y-3" aria-labelledby="admin-notifications-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="admin-notifications-title" className="text-base font-semibold">{title}</h2>
        <Link href="/notifications/search" className="text-sm font-medium text-primary hover:underline">
          {viewAll}
        </Link>
      </div>
      <div className="divide-y rounded-lg border bg-card px-4 shadow-sm">
        {notifications.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          notifications.map((notification) => (
            <Link
              key={notification.id}
              href={adminNotificationHref(notification)}
              className="block py-3 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium">{notification.title}</span>
                {notification.is_outstanding && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
              </span>
              <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                {notification.message}
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function PendingLink({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm hover:text-primary"
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

interface MarkerFilters {
  search: string;
  state: string;
  kind: string;
  contractor: string;
  recycler: string;
  projectStatus: string;
}

function filterMarkers(
  markers: AdminDashboardMarker[],
  filters: MarkerFilters,
) {
  const needle = filters.search.trim().toLocaleLowerCase();
  return markers.filter((marker) => {
    if (filters.state !== "ALL" && marker.state !== filters.state) return false;
    if (filters.kind !== "ALL" && marker.kind !== filters.kind) return false;
    if (filters.projectStatus !== "ALL") {
      if (marker.kind !== "PROJECT" || marker.status !== filters.projectStatus)
        return false;
    }
    if (filters.contractor !== "ALL") {
      if (marker.company_id !== filters.contractor) return false;
    }
    if (filters.recycler !== "ALL") {
      const isRecyclerLocation =
        marker.company_type === "RECYCLER" &&
        marker.company_id === filters.recycler;
      const isServedProject =
        marker.kind === "PROJECT" &&
        marker.recycler_ids?.includes(filters.recycler);
      if (!isRecyclerLocation && !isServedProject) return false;
    }
    if (!needle) return true;
    return [
      marker.name,
      marker.company_name,
      marker.project_name,
      marker.address,
      marker.scale_code,
      ...(marker.recycler_names ?? []),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(needle));
  });
}

function toMapMarker(
  marker: AdminDashboardMarker,
  t: ReturnType<typeof useTranslations<"dashboard.admin">>,
): LocationMapMarker {
  const details = [
    marker.company_name,
    marker.project_name,
    marker.address,
    marker.recycler_names?.length
      ? t("map.recyclers", { value: marker.recycler_names.join(", ") })
      : "",
    marker.today_orders !== undefined
      ? t("map.orders", { value: marker.today_orders })
      : "",
    marker.today_weight_kg !== undefined
      ? t("map.weight", { value: Number(marker.today_weight_kg).toFixed(2) })
      : "",
  ].filter(Boolean);
  return {
    id: marker.id,
    latitude: Number(marker.latitude),
    longitude: Number(marker.longitude),
    label: marker.name,
    detail: details.join(" | "),
    tone:
      marker.status === "ACTIVE"
        ? "positive"
        : marker.status === "SUSPENDED" || marker.status === "INACTIVE"
          ? "danger"
          : "primary",
    icon:
      marker.kind === "PROJECT"
        ? "project"
        : marker.kind === "RECYCLER"
          ? "recycler"
          : marker.kind === "SCALE"
            ? "scale"
            : "building",
  };
}

function combineTrends(data: AdminDashboardData) {
  return data.trends.companies.map((point, index) => ({
    month: point.month.slice(0, 7),
    companies: Number(point.value),
    contractors: Number(data.trends.contractors[index]?.value ?? 0),
    recyclers: Number(data.trends.recyclers[index]?.value ?? 0),
    orders: Number(data.trends.orders[index]?.value ?? 0),
    weight: Math.round(Number(data.trends.weight_kg[index]?.value ?? 0) / 1000),
    saasRevenue: Number(data.trends.saas_revenue[index]?.value ?? 0),
    commissionRevenue: Number(
      data.trends.commission_revenue[index]?.value ?? 0,
    ),
  }));
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function uniqueCompanies(markers: AdminDashboardMarker[]) {
  const companies = new Map<string, string>();
  markers.forEach((marker) =>
    companies.set(marker.company_id, marker.company_name),
  );
  return [...companies.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function countMarkerKinds(markers: AdminDashboardMarker[]) {
  const counts = { PROJECT: 0, RECYCLER: 0, SCALE: 0, HEADQUARTERS: 0 };
  markers.forEach((marker) => {
    counts[marker.kind] += 1;
  });
  return counts;
}

function MapFilter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-2xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function MapSelect({
  value,
  onChange,
  label,
  allLabel,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      aria-label={label}
    >
      <option value="ALL">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MapLegend({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  tone: "primary" | "positive" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : tone === "primary"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`grid size-7 place-items-center rounded-full ${toneClass}`}
      >
        <Icon className="size-3.5" />
      </span>
      <span>{label}</span>
      <strong className="tabular-nums text-foreground">{value}</strong>
    </span>
  );
}

function formatMetric(
  value: NumericValue,
  kind: Metric["format"],
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"dashboard.admin">>,
) {
  const numeric = Number(value);
  if (kind === "currency")
    return format.number(numeric, {
      style: "currency",
      currency: "MYR",
      maximumFractionDigits: 2,
    });
  if (kind === "weight")
    return t("weightValue", {
      value: format.number(numeric / 1000, { maximumFractionDigits: 2 }),
    });
  return format.number(numeric);
}

function healthTone(status: string) {
  if (status === "ok" || status === "configured") return "positive" as const;
  if (status === "degraded") return "warning" as const;
  return "danger" as const;
}

function AdminDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-[32rem] w-full rounded-lg" />
      {Array.from({ length: 4 }).map((_, section) => (
        <div key={section} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((__, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
