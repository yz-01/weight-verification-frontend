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
  Search,
  Settings,
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

import {
  LocationMap,
  type LocationMapMarker,
} from "@/components/shared/location-map";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AdminDashboardData,
  AdminDashboardMarker,
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
  icon: typeof Building2;
  format?: "number" | "weight" | "currency";
  tone?: "default" | "warning" | "danger";
}

export function AdminDashboard({
  section,
}: {
  section?: AdminDashboardSection;
}) {
  const t = useTranslations("dashboard.admin");
  const df = useDateFormat();
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [state, setState] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [contractor, setContractor] = useState("ALL");
  const [recycler, setRecycler] = useState("ALL");
  const [projectStatus, setProjectStatus] = useState("ALL");
  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getAdminDashboard,
    refetchInterval: 60_000,
  });
  const monitoring = useQuery({
    queryKey: ["monitoring", "dashboard-system-status"],
    queryFn: getMonitoringOverview,
    enabled: section === undefined || section === "system-status",
    refetchInterval: 30_000,
  });

  const show = (target: AdminDashboardSection) =>
    section === undefined || section === target;

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

  if (dashboard.isError) {
    return (
      <div className="border-y py-12 text-center text-sm text-muted-foreground">
        {t("error")}
      </div>
    );
  }
  if (!data) return <AdminDashboardSkeleton />;

  const platformMetrics: Metric[] = [
    {
      key: "contractors",
      value: data.platform.contractors,
      href: "/companies?type=CONTRACTOR",
      icon: Building2,
    },
    {
      key: "recyclers",
      value: data.platform.recyclers,
      href: "/companies?type=RECYCLER",
      icon: Recycle,
    },
    {
      key: "projects",
      value: data.platform.projects,
      href: "/companies",
      icon: MapPinned,
    },
    { key: "users", value: data.platform.users, href: "/users", icon: Users },
    {
      key: "onlineUsers",
      value: data.platform.online_users,
      href: "/users",
      icon: CheckCircle2,
    },
  ];
  const businessMetrics: Metric[] = [
    {
      key: "orders",
      value: data.business_today.orders,
      href: "/reports",
      icon: Receipt,
    },
    {
      key: "completedOrders",
      value: data.business_today.completed_orders,
      href: "/reports",
      icon: ClipboardCheck,
    },
    {
      key: "recoveredWeight",
      value: data.business_today.recovered_weight_kg,
      href: "/weighing",
      icon: Weight,
      format: "weight",
    },
    {
      key: "settlementAmount",
      value: data.business_today.settlement_amount,
      href: "/billing",
      icon: CircleDollarSign,
      format: "currency",
    },
    {
      key: "serviceCommission",
      value: data.business_today.service_commission,
      href: "/billing",
      icon: CreditCard,
      format: "currency",
    },
  ];
  const subscriptionMetrics: Metric[] = [
    {
      key: "activeSubscriptions",
      value: data.subscriptions.active,
      href: "/subscriptions",
      icon: CheckCircle2,
    },
    {
      key: "expiringSubscriptions",
      value: data.subscriptions.expiring_soon,
      href: "/subscriptions?state=EXPIRING_SOON",
      icon: AlertTriangle,
      tone: "warning",
    },
    {
      key: "expiredSubscriptions",
      value: data.subscriptions.expired,
      href: "/subscriptions?state=EXPIRED",
      icon: AlertTriangle,
      tone: "danger",
    },
    {
      key: "renewedToday",
      value: data.subscriptions.renewed_today,
      href: "/subscriptions",
      icon: CreditCard,
    },
    {
      key: "monthlySaasRevenue",
      value: data.subscriptions.monthly_revenue,
      href: "/billing?kind=SAAS",
      icon: CircleDollarSign,
      format: "currency",
    },
  ];
  const commissionMetrics: Metric[] = [
    {
      key: "commissionWeight",
      value: data.commission.business_weight_kg,
      href: "/billing?kind=COMMISSION",
      icon: Weight,
      format: "weight",
    },
    {
      key: "commissionSettlement",
      value: data.commission.settlement_amount,
      href: "/billing?kind=COMMISSION",
      icon: Receipt,
      format: "currency",
    },
    {
      key: "commissionReceivable",
      value: data.commission.receivable,
      href: "/billing?kind=COMMISSION",
      icon: CreditCard,
      format: "currency",
    },
    {
      key: "commissionReceived",
      value: data.commission.received,
      href: "/billing?kind=COMMISSION",
      icon: CheckCircle2,
      format: "currency",
    },
    {
      key: "commissionOutstanding",
      value: data.commission.outstanding,
      href: "/billing?kind=COMMISSION",
      icon: AlertTriangle,
      format: "currency",
      tone: Number(data.commission.outstanding) > 0 ? "warning" : "default",
    },
  ];
  const trendRows = combineTrends(data);
  const contractorOptions = uniqueSorted(
    data.map.markers
      .filter((marker) => marker.kind === "PROJECT")
      .map((marker) => marker.company_name),
  );
  const recyclerOptions = uniqueSorted(
    data.map.markers.flatMap((marker) =>
      marker.kind === "RECYCLER"
        ? [marker.company_name]
        : (marker.recycler_names ?? []),
    ),
  );
  const projectStatusOptions = uniqueSorted(
    data.map.markers
      .filter((marker) => marker.kind === "PROJECT")
      .map((marker) => marker.status),
  );

  return (
    <div className="space-y-8">
      {show("map") && (
        <section className="space-y-3" aria-labelledby="admin-map-title">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="admin-map-title" className="text-base font-semibold">
                {t("map.title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("updatedAt", { value: df.dateTime(data.generated_at) })}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_9rem_11rem_11rem_11rem_10rem]">
              <label className="relative">
                <span className="sr-only">{t("map.search")}</span>
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("map.search")}
                  className="pl-9"
                />
              </label>
              <select
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                aria-label={t("map.state")}
              >
                <option value="ALL">{t("map.allStates")}</option>
                {data.map.states.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={contractor}
                onChange={(event) => setContractor(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                aria-label={t("map.contractor")}
              >
                <option value="ALL">{t("map.allContractors")}</option>
                {contractorOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={recycler}
                onChange={(event) => setRecycler(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                aria-label={t("map.recycler")}
              >
                <option value="ALL">{t("map.allRecyclers")}</option>
                {recyclerOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={projectStatus}
                onChange={(event) => setProjectStatus(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                aria-label={t("map.projectStatus")}
              >
                <option value="ALL">{t("map.allStatuses")}</option>
                {projectStatusOptions.map((item) => (
                  <option key={item} value={item}>
                    {t(`map.statusValue.${item}`)}
                  </option>
                ))}
              </select>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                aria-label={t("map.kind")}
              >
                <option value="ALL">{t("map.allKinds")}</option>
                {(
                  ["PROJECT", "RECYCLER", "SCALE", "HEADQUARTERS"] as const
                ).map((item) => (
                  <option key={item} value={item}>
                    {t(`map.kindValue.${item}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <LocationMap
            center={[4.2105, 101.9758]}
            markers={mapMarkers}
            className="min-h-[28rem]"
          />
          <p className="text-xs text-muted-foreground">
            {t("map.visible", {
              visible: markers.length,
              total: data.map.markers.length,
            })}
          </p>
        </section>
      )}

      {show("platform") && (
        <MetricSection
          title={t("section.platform")}
          metrics={platformMetrics}
          t={t}
          format={format}
        />
      )}
      {show("business") && (
        <MetricSection
          title={t("section.businessToday")}
          metrics={businessMetrics}
          t={t}
          format={format}
        />
      )}
      {show("subscriptions") && (
        <MetricSection
          title={t("section.subscriptions")}
          metrics={subscriptionMetrics}
          t={t}
          format={format}
        />
      )}
      {show("commission") && (
        <MetricSection
          title={t("section.commission")}
          metrics={commissionMetrics}
          t={t}
          format={format}
        />
      )}

      {(show("trends") || show("pending")) && (
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
                <div className="h-80 border-y py-4">
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
                        stroke="#087f8c"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="recyclers"
                        name={t("trends.recyclers")}
                        stroke="#9a3412"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        name={t("trends.orders")}
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        name={t("trends.weight")}
                        stroke="#16825d"
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
                <div className="h-72 border-y py-4">
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
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="commissionRevenue"
                        name={t("trends.commissionRevenue")}
                        stroke="#ca8a04"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          )}

          {show("pending") && (
            <section
              className="space-y-3"
              aria-labelledby="admin-pending-title"
            >
              <h2 id="admin-pending-title" className="text-base font-semibold">
                {t("pending.title")}
              </h2>
              <div className="divide-y border-y">
                <PendingLink
                  href="/companies?type=CONTRACTOR&review_status=PENDING"
                  label={t("pending.contractorReviews")}
                  value={data.pending.contractor_reviews}
                />
                <PendingLink
                  href="/companies?type=RECYCLER&review_status=PENDING"
                  label={t("pending.recyclerReviews")}
                  value={data.pending.recycler_reviews}
                />
                <PendingLink
                  href="/billing?payment_state=PENDING"
                  label={t("pending.payments")}
                  value={data.pending.payments}
                />
                <PendingLink
                  href="/monitoring"
                  label={t("pending.systemExceptions")}
                  value={data.pending.system_exceptions}
                />
                <PendingLink
                  href="/customer-service"
                  label={t("pending.customerService")}
                  value={data.pending.customer_service}
                />
                <PendingLink
                  href="/support-tickets"
                  label={t("pending.supportTickets")}
                  value={data.pending.support_tickets}
                />
              </div>
            </section>
          )}
        </div>
      )}

      {(show("cwe") || show("notifications")) && (
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

          {show("notifications") && (
            <section
              className="space-y-3"
              aria-labelledby="admin-notifications-title"
            >
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="admin-notifications-title"
                  className="text-base font-semibold"
                >
                  {t("notifications.title")}
                </h2>
                <Link
                  href="/notifications"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t("notifications.viewAll")}
                </Link>
              </div>
              <div className="divide-y border-y">
                {data.notifications.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("notifications.empty")}
                  </p>
                ) : (
                  data.notifications.map((notification) => (
                    <div key={notification.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
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
            {[
              { key: "companies", href: "/companies", icon: Building2 },
              { key: "users", href: "/users", icon: Users },
              {
                key: "subscriptions",
                href: "/subscriptions",
                icon: CreditCard,
              },
              { key: "billing", href: "/billing", icon: Receipt },
              { key: "reports", href: "/reports", icon: FileText },
              { key: "settings", href: "/system-settings", icon: Settings },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  className="flex min-h-16 items-center gap-3 border-y px-1 py-3 text-sm font-medium hover:text-primary"
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
  t,
  format,
}: {
  title: string;
  metrics: Metric[];
  t: ReturnType<typeof useTranslations<"dashboard.admin">>;
  format: ReturnType<typeof useFormatter>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.key}
              href={metric.href}
              className="min-h-28 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t(`metric.${metric.key}`)}
                </p>
                <Icon
                  className={`h-4 w-4 ${metric.tone === "danger" ? "text-destructive" : metric.tone === "warning" ? "text-warning" : "text-muted-foreground"}`}
                />
              </div>
              <p className="mt-4 text-2xl font-semibold tabular-nums">
                {formatMetric(metric.value, metric.format, format, t)}
              </p>
            </Link>
          );
        })}
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
      if (
        marker.company_type !== "CONTRACTOR" ||
        marker.company_name !== filters.contractor
      )
        return false;
    }
    if (filters.recycler !== "ALL") {
      const isRecyclerLocation =
        marker.company_type === "RECYCLER" &&
        marker.company_name === filters.recycler;
      const isServedProject =
        marker.kind === "PROJECT" &&
        marker.recycler_names?.includes(filters.recycler);
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
