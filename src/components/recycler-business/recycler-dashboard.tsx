"use client";

import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Inbox,
  Package,
  Recycle,
  Scale,
  Truck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StatusBadge } from "@/components/shared/page-primitives";
import { LocationMap, type LocationMapMarker, type LocationMapPath, type LocationMapZone } from "@/components/shared/location-map";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  RecyclerDashboardData,
  RecyclerDashboardInvoice,
  RecyclerDashboardNotification,
  RecyclerRecentOrder,
  RecyclerRecentOutbound,
  RecyclerRecentRecovery,
} from "@/interfaces/recycler-dashboard";
import { useDateFormat } from "@/lib/dates";
import { getRecyclerDashboard } from "@/services/recycler-dashboard.service";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSites } from "@/services/weighing.service";
import { getDriverLivePositions, getDriverLiveRoutes } from "@/services/driver-gps.service";
import { trackPaths } from "@/lib/track-paths";

interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "positive" | "warning" | "danger";
}

interface QuickAction {
  feature: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

const CHART_COLORS = {
  platform: "#087f8c",
  private: "#9a3412",
  total: "#2563eb",
  outbound: "#16825d",
} as const;

/** Sentinel for "the whole company"; an empty string is not a valid id. */
const ALL_YARDS = "__all__";

export function RecyclerDashboard({ features }: { features: string[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const df = useDateFormat();
  const [site, setSite] = useState(ALL_YARDS);
  const yards = useQuery({
    queryKey: ["recycling-sites", "dashboard"],
    queryFn: () => getSites({ page_size: 100, sort_by: "name" }),
  });
  const dashboard = useQuery({
    queryKey: ["recycler-dashboard", site],
    queryFn: () => getRecyclerDashboard(site === ALL_YARDS ? undefined : site),
    refetchInterval: 15_000,
    staleTime: 30_000,
  });
  const chartRows = useMemo(() => {
    const charts = dashboard.data?.charts;
    if (!charts) return null;
    return {
      today: charts.recovery_today.map((row) => ({
        ...row,
        platform: Number(row.platform_weight_kg),
        private: Number(row.private_weight_kg),
      })),
      month: charts.recovery_month.map((row) => ({
        ...row,
        day: df.date(row.date),
        platform: Number(row.platform_weight_kg),
        private: Number(row.private_weight_kg),
      })),
      outbound: charts.outbound_month.map((row) => ({
        ...row,
        day: df.date(row.date),
        weight: Number(row.weight_kg),
      })),
    };
  }, [dashboard.data?.charts, df]);

  if (dashboard.isLoading) return <RecyclerDashboardSkeleton />;

  if (dashboard.isError || !dashboard.data) {
    return (
      <section className="flex min-h-48 flex-col items-center justify-center gap-4 border-y py-8 text-center">
        <AlertCircle className="size-7 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("errors.generic")}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => dashboard.refetch()}
        >
          {t("common.retry")}
        </Button>
      </section>
    );
  }

  const data = dashboard.data;
  const weight = (value: string | number) =>
    `${format.number(Number(value), { maximumFractionDigits: 3 })} kg`;
  const number = (value: number) => format.number(value);
  const money = (value: string | number, currency = "MYR") =>
    format.number(Number(value), {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });

  const quickActions: QuickAction[] = [
    {
      feature: "customer_management",
      href: "/recycler-customers",
      label: t("nav.customer_management"),
      icon: Users,
    },
    {
      feature: "waste_orders",
      href: "/waste-orders",
      label: t("nav.waste_orders"),
      icon: Inbox,
    },
    {
      feature: "driver_tasks",
      href: "/tasks",
      label: t("nav.driver_tasks"),
      icon: Truck,
    },
    {
      feature: "weighing_records",
      href: "/weighing",
      label: t("nav.weighing_records"),
      icon: Scale,
    },
    {
      feature: "inventory_management",
      href: "/recycler-inventory",
      label: t("nav.inventory_management"),
      icon: Boxes,
    },
    {
      feature: "outbound_management",
      href: "/recycler-outbound",
      label: t("nav.outbound_management"),
      icon: Package,
    },
    {
      feature: "transaction_reports",
      href: "/reports",
      label: t("nav.transaction_reports"),
      icon: FileText,
    },
  ].filter((action) => features.includes(action.feature));

  const yardRows = yards.data?.results ?? [];
  const narrowed = data.site?.id != null;

  return (
    <div className="space-y-8">
      {yardRows.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm font-medium">{t("recyclerYard.filter")}</span>
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="h-9 w-56" aria-label={t("recyclerYard.filter")}>
              <SelectValue placeholder={t("recyclerYard.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_YARDS}>{t("recyclerYard.all")}</SelectItem>
              {yardRows.map((yard) => (
                <SelectItem key={yard.id} value={yard.id}>
                  {yard.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {narrowed && (
            <p className="text-xs text-muted-foreground">
              {t("recyclerYard.companyWideNote")}
            </p>
          )}
        </div>
      )}
      <PendingActions data={data} number={number} />
      {data.business_today && (
        <section className="space-y-3" aria-labelledby="recycler-today-title">
          <SectionHeading
            id="recycler-today-title"
            title={t("dashboard.metrics")}
            meta={df.date(data.date)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard
              label={t("dashboard.tile.wasteOrders")}
              value={number(data.business_today.platform_orders)}
              icon={Inbox}
              href="/waste-orders"
            />
            <MetricCard
              label={t("dispatches.state.PENDING_ACCEPTANCE")}
              value={number(data.business_today.waiting_acceptance)}
              icon={Inbox}
              href="/waste-orders"
              tone="warning"
            />
            <MetricCard
              label={t("dispatches.state.ACCEPTED")}
              value={number(data.business_today.pending_dispatch)}
              icon={Truck}
              href="/tasks"
              tone="warning"
            />
            <MetricCard
              label={t("dispatches.state.COLLECTED")}
              value={number(data.business_today.active_collections)}
              icon={Recycle}
              href="/waste-orders"
            />
            <MetricCard
              label={t("dispatches.state.SETTLED")}
              value={number(data.business_today.completed)}
              icon={CheckCircle2}
              href="/waste-orders"
              tone="positive"
            />
            <MetricCard
              label={t("dispatches.state.CANCELLED")}
              value={number(data.business_today.cancelled)}
              icon={XCircle}
              href="/waste-orders"
              tone="danger"
            />
          </div>
        </section>
      )}

      <RecyclerDriverMap />

      <div className="grid gap-8 xl:grid-cols-3">
        {data.recovery_today && (
          <MetricBand
            title={t("dashboard.admin.metric.recoveredWeight")}
            metrics={[
              {
                label: t("recyclerBusiness.source.PLATFORM"),
                value: weight(data.recovery_today.platform_weight_kg),
              },
              {
                label: t("recyclerBusiness.source.PRIVATE"),
                value: weight(data.recovery_today.private_weight_kg),
              },
              {
                label: t("recyclerBusiness.inventory.total"),
                value: weight(data.recovery_today.total_weight_kg),
              },
              {
                label: t("dashboard.tile.weighingSessions"),
                value: number(data.recovery_today.completed_weighings),
              },
            ]}
          />
        )}
        {data.inventory && (
          <MetricBand
            title={t("recyclerBusiness.inventory.title")}
            metrics={[
              {
                label: t("recyclerBusiness.inventory.platform"),
                value: weight(data.inventory.platform_weight_kg),
              },
              {
                label: t("recyclerBusiness.inventory.private"),
                value: weight(data.inventory.private_weight_kg),
              },
              {
                label: t("recyclerBusiness.inventory.total"),
                value: weight(data.inventory.total_weight_kg),
              },
            ]}
          />
        )}
        {data.outbound_today && (
          <MetricBand
            title={t("recyclerBusiness.outbound.title")}
            metrics={[
              {
                label: t("recyclerBusiness.field.weight"),
                value: weight(data.outbound_today.weight_kg),
              },
              {
                label: t("recyclerBusiness.field.shipmentCount"),
                value: number(data.outbound_today.count),
              },
            ]}
          />
        )}
      </div>

      {data.fees && <FeeSummary data={data} money={money} weight={weight} />}

      {quickActions.length > 0 && (
        <section className="space-y-3" aria-labelledby="recycler-quick-title">
          <SectionHeading
            id="recycler-quick-title"
            title={t("dashboard.admin.quickActions.title")}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.feature}
                  href={action.href}
                  className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border bg-card px-3 py-4 text-center text-sm font-medium shadow-sm transition-colors hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  <span>{action.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {chartRows && data.charts && (
        <section className="space-y-3" aria-labelledby="recycler-charts-title">
          <SectionHeading
            id="recycler-charts-title"
            title={t("dashboard.admin.trends.operatingTitle")}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel
              title={`${t("dashboard.admin.metric.recoveredWeight")} · ${t("wasteOutgoing.totals.today")}`}
            >
              <LineChart
                data={chartRows.today}
                margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={52} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="platform"
                  name={t("recyclerBusiness.source.PLATFORM")}
                  stroke={CHART_COLORS.platform}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="private"
                  name={t("recyclerBusiness.source.PRIVATE")}
                  stroke={CHART_COLORS.private}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartPanel>

            <ChartPanel
              title={`${t("dashboard.admin.metric.recoveredWeight")} · ${t("wasteOutgoing.totals.month")}`}
            >
              <LineChart
                data={chartRows.month}
                margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis tickLine={false} axisLine={false} width={52} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="platform"
                  name={t("recyclerBusiness.source.PLATFORM")}
                  stroke={CHART_COLORS.platform}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="private"
                  name={t("recyclerBusiness.source.PRIVATE")}
                  stroke={CHART_COLORS.private}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartPanel>

            {data.inventory && (
              <ChartPanel title={t("recyclerBusiness.inventory.title")}>
                <BarChart
                  data={[
                    {
                      name: t("recyclerBusiness.source.PLATFORM"),
                      weight: Number(data.inventory.platform_weight_kg),
                    },
                    {
                      name: t("recyclerBusiness.source.PRIVATE"),
                      weight: Number(data.inventory.private_weight_kg),
                    },
                  ]}
                  margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={52} />
                  <Tooltip />
                  <Bar
                    dataKey="weight"
                    name={t("recyclerBusiness.field.weight")}
                    fill={CHART_COLORS.total}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartPanel>
            )}

            {data.permissions.outbound && (
              <ChartPanel
                title={`${t("recyclerBusiness.outbound.title")} · ${t("wasteOutgoing.totals.month")}`}
              >
                <BarChart
                  data={chartRows.outbound}
                  margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis tickLine={false} axisLine={false} width={52} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="weight"
                    name={t("recyclerBusiness.field.weight")}
                    fill={CHART_COLORS.outbound}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartPanel>
            )}
          </div>
        </section>
      )}

      <LatestNotifications notifications={data.notifications} />
      <RecentBusiness data={data} money={money} weight={weight} />
    </div>
  );
}

function RecyclerDriverMap() {
  const t = useTranslations();
  const live = useQuery({
    queryKey: ["driver-gps", "live"],
    queryFn: () => getDriverLivePositions({ page_size: 200, running: true }),
    refetchInterval: 15_000,
  });
  const routes = useQuery({
    queryKey: ["driver-gps", "live-routes"],
    queryFn: () => getDriverLiveRoutes(50),
    refetchInterval: 15_000,
  });
  const positions = useMemo(
    () => live.data?.results ?? [],
    [live.data?.results],
  );
  const byTask = useMemo(
    () => new Map(positions.map((position) => [position.task, position])),
    [positions],
  );
  const markers = useMemo<LocationMapMarker[]>(
    () =>
      positions.map((position) => ({
        id: position.id,
        latitude: Number(position.latitude),
        longitude: Number(position.longitude),
        label: `${position.driver_name} · ${position.vehicle_plate}`,
        detail: `${position.task_no}${position.project_name ? ` · ${position.project_name}` : ""}`,
        tone: position.is_stale
          ? "warning"
          : position.geofence_result === "OUTSIDE"
            ? "danger"
            : "positive",
        stale: position.is_stale,
        icon: "truck",
      })),
    [positions],
  );
  const zones = useMemo<LocationMapZone[]>(() => {
    const seen = new Set<string>();
    return positions.flatMap((position) => {
      if (
        !position.project_latitude ||
        !position.project_longitude ||
        !position.project_geofence_radius_m
      ) {
        return [];
      }
      const id = `${position.project_latitude}:${position.project_longitude}`;
      if (seen.has(id)) return [];
      seen.add(id);
      return [{
        id,
        center: [Number(position.project_latitude), Number(position.project_longitude)] as [number, number],
        radiusM: position.project_geofence_radius_m,
        label: position.project_name ?? t("recyclerBusiness.liveDrivers.project"),
        color: "#087f8c",
      }];
    });
  }, [positions, t]);
  const paths = useMemo<LocationMapPath[]>(
    () =>
      (routes.data?.routes ?? []).flatMap((route, index) => {
        const driver = byTask.get(route.task);
        return trackPaths({
          id: route.task,
          points: route.positions.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            occurredAt: point.original_occurred_at,
          })),
          color: ["#2563eb", "#7c3aed", "#15803d", "#a16207"][index % 4],
          label: driver ? `${driver.driver_name} · ${driver.vehicle_plate}` : undefined,
          gapLabel: (minutes) => t("driver.track.gap", { minutes }),
        });
      }),
    [byTask, routes.data?.routes, t],
  );

  return (
    <section className="space-y-3" aria-labelledby="recycler-live-drivers-title">
      <SectionHeading
        id="recycler-live-drivers-title"
        title={t("recyclerBusiness.liveDrivers.title")}
        meta={t("recyclerBusiness.liveDrivers.count", { count: positions.length })}
      />
      {live.isError ? (
        <div className="border-y py-8 text-center text-sm text-muted-foreground">
          {t("recyclerBusiness.liveDrivers.unavailable")}
        </div>
      ) : positions.length === 0 ? (
        <div className="border-y py-8 text-center text-sm text-muted-foreground">
          {t("recyclerBusiness.liveDrivers.empty")}
        </div>
      ) : (
        <LocationMap
          markers={markers}
          zones={zones}
          paths={paths}
          preserveViewOnDataUpdate
          fitBoundsKey="recycler-live-drivers"
          ariaLabel={t("recyclerBusiness.liveDrivers.mapLabel")}
          className="h-[24rem] min-h-[24rem] rounded-md sm:h-[28rem] sm:min-h-[28rem]"
        />
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
}: MetricCardProps) {
  const toneClass = {
    default: "text-primary bg-primary/10",
    positive: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    danger: "text-destructive bg-destructive/10",
  }[tone];
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-5 text-muted-foreground">
          {label}
        </p>
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${toneClass}`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="min-h-28 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="min-h-28 rounded-lg border bg-card p-4 shadow-sm">
      {content}
    </article>
  );
}

function SectionHeading({
  id,
  title,
  meta,
}: {
  id: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      <h2 id={id} className="text-base font-semibold text-foreground">
        {title}
      </h2>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
    </div>
  );
}

function MetricBand({
  title,
  metrics,
}: {
  title: string;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <dl className="divide-y border-y">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex min-h-14 items-center justify-between gap-4 py-3"
          >
            <dt className="text-sm text-muted-foreground">{metric.label}</dt>
            <dd className="text-base font-semibold tabular-nums text-foreground">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PendingActions({
  data,
  number,
}: {
  data: RecyclerDashboardData;
  number: (value: number) => string;
}) {
  const t = useTranslations();
  const rows = [
    data.pending.waiting_acceptance === undefined
      ? null
      : {
          key: "waiting",
          label: t("dispatches.state.PENDING_ACCEPTANCE"),
          value: data.pending.waiting_acceptance,
          href: "/waste-orders",
        },
    data.pending.pending_dispatch === undefined
      ? null
      : {
          key: "dispatch",
          label: t("dispatches.state.ACCEPTED"),
          value: data.pending.pending_dispatch,
          href: "/tasks",
        },
    data.pending.pending_deduction_confirmation === undefined
      ? null
      : {
          key: "deduction",
          label: t("reports.transaction.deductions"),
          value: data.pending.pending_deduction_confirmation,
          href: "/deductions",
        },
    !data.pending.weighing_confirmation.available ||
    data.pending.weighing_confirmation.count === null
      ? null
      : {
          key: "weighing-confirmation",
          label: t("weighing.ticketStatus.PENDING_CONFIRMATION"),
          value: data.pending.weighing_confirmation.count,
          href: "/weighing",
        },
    !data.pending.weighing_anomalies.available ||
    data.pending.weighing_anomalies.count === null
      ? null
      : {
          key: "weighing-anomalies",
          label: t("weighing.field.anomalyCount"),
          value: data.pending.weighing_anomalies.count,
          href: "/weighing",
        },
    data.pending.open_saas_invoices === null
      ? null
      : {
          key: "saas",
          label: t("billing.kind.SAAS"),
          value: data.pending.open_saas_invoices,
          href: "/billing",
        },
    data.pending.open_commission_invoices === null
      ? null
      : {
          key: "commission",
          label: t("billing.kind.COMMISSION"),
          value: data.pending.open_commission_invoices,
          href: "/billing",
        },
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="recycler-pending-title">
      <SectionHeading
        id="recycler-pending-title"
        title={t("dashboard.admin.pending.title")}
      />
      <div className="divide-y rounded-lg border bg-card px-4 shadow-sm">
        {rows.map((row) => (
          <Link
            key={row.key}
            href={row.href}
            className="flex min-h-14 items-center justify-between gap-4 py-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-sm font-medium">{row.label}</span>
            <span className="min-w-8 rounded-md bg-muted px-2 py-1 text-center text-sm font-semibold tabular-nums">
              {number(row.value)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FeeSummary({
  data,
  money,
  weight,
}: {
  data: RecyclerDashboardData;
  money: (value: string | number, currency?: string) => string;
  weight: (value: string | number) => string;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  if (!data.fees) return null;
  const { subscription, commission } = data.fees;

  return (
    <section className="space-y-3" aria-labelledby="recycler-fees-title">
      <SectionHeading id="recycler-fees-title" title={t("billing.title")} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <WalletCards className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold">{t("billing.kind.SAAS")}</h3>
          </div>
          <dl className="mt-4 space-y-3">
            <SummaryRow
              label={t("billing.field.kind")}
              value={subscription.plan_name ?? t("common.emptyValue")}
            />
            <SummaryRow
              label={t("billing.field.dueDate")}
              value={df.date(subscription.expires_on) || t("common.emptyValue")}
            />
            <SummaryRow
              label={t("billing.field.outstanding")}
              value={money(subscription.outstanding)}
            />
          </dl>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CircleDollarSign
              className="size-4 text-primary"
              aria-hidden="true"
            />
            <h3 className="text-sm font-semibold">
              {t("billing.kind.COMMISSION")}
            </h3>
          </div>
          <dl className="mt-4 space-y-3">
            <SummaryRow
              label={t("billing.field.businessWeight")}
              value={weight(commission.business_weight_kg)}
            />
            <SummaryRow
              label={t("billing.field.settlementAmount")}
              value={money(commission.settlement_amount)}
            />
            <SummaryRow
              label={t("billing.field.receivable")}
              value={money(commission.amount_due)}
            />
            <SummaryRow
              label={t("billing.field.outstanding")}
              value={money(commission.outstanding)}
            />
          </dl>
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactElement;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LatestNotifications({
  notifications,
}: {
  notifications: RecyclerDashboardNotification[];
}) {
  const t = useTranslations();
  const df = useDateFormat();
  return (
    <section
      className="space-y-3"
      aria-labelledby="recycler-notifications-title"
    >
      <div className="flex min-h-8 items-center justify-between gap-4">
        <h2
          id="recycler-notifications-title"
          className="text-base font-semibold"
        >
          {t("dashboard.admin.notifications.title")}
        </h2>
        <Link
          href="/notifications"
          className="text-sm font-medium text-primary"
        >
          {t("dashboard.admin.notifications.viewAll")}
        </Link>
      </div>
      {notifications.length === 0 ? (
        <p className="border-y py-6 text-sm text-muted-foreground">
          {t("dashboard.admin.notifications.empty")}
        </p>
      ) : (
        <div className="divide-y border-y">
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href={notification.href}
              className="flex min-h-16 items-start gap-3 py-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.is_read ? "bg-muted-foreground/30" : "bg-primary"}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {notification.title}
                </span>
                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {notification.message}
                </span>
              </span>
              <time className="shrink-0 text-xs text-muted-foreground">
                {df.relative(notification.created_at)}
              </time>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentBusiness({
  data,
  money,
  weight,
}: {
  data: RecyclerDashboardData;
  money: (value: string | number, currency?: string) => string;
  weight: (value: string | number) => string;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  return (
    <section className="space-y-3" aria-labelledby="recycler-recent-title">
      <SectionHeading
        id="recycler-recent-title"
        title={t("reports.transaction.transactions")}
      />
      <div className="grid gap-x-8 gap-y-6 xl:grid-cols-2">
        <RecentGroup
          title={t("dashboard.tile.wasteOrders")}
          href="/waste-orders"
          empty={t("reports.empty")}
          rows={data.recent.orders.map((row) =>
            recentOrder(row, df.dateTime(row.occurred_at), t),
          )}
        />
        <RecentGroup
          title={t("dashboard.tile.weighingSessions")}
          href="/weighing"
          empty={t("reports.empty")}
          rows={data.recent.recoveries.map((row) =>
            recentRecovery(row, df.dateTime(row.occurred_at), weight, t),
          )}
        />
        <RecentGroup
          title={t("recyclerBusiness.outbound.title")}
          href="/recycler-outbound"
          empty={t("reports.empty")}
          rows={data.recent.outbound.map((row) =>
            recentOutbound(row, df.dateTime(row.occurred_at), weight, t),
          )}
        />
        <RecentGroup
          title={t("billing.field.invoices")}
          href="/billing"
          empty={t("reports.empty")}
          rows={data.recent.invoices.map((row) => recentInvoice(row, money, t))}
        />
        <RecentGroup
          title={t("dashboard.admin.notifications.title")}
          href="/notifications"
          empty={t("dashboard.admin.notifications.empty")}
          rows={data.recent.notifications.map((row) => ({
            id: row.id,
            href: row.href,
            primary: row.title,
            secondary: df.dateTime(row.created_at),
            value: "",
            status: "",
            tone: "neutral" as const,
          }))}
        />
      </div>
    </section>
  );
}

interface RecentRow {
  id: string;
  href: string;
  primary: string;
  secondary: string;
  value: string;
  status: string;
  tone: "neutral" | "positive" | "warning" | "danger" | "info";
}

function RecentGroup({
  title,
  href,
  empty,
  rows,
}: {
  title: string;
  href: string;
  empty: string;
  rows: RecentRow[];
}) {
  const t = useTranslations();
  return (
    <div className="min-w-0">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b pb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={href} className="text-xs font-medium text-primary">
          {t("common.view")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {row.primary}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {row.secondary}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1.5">
                {row.value && (
                  <span className="text-sm font-semibold tabular-nums">
                    {row.value}
                  </span>
                )}
                {row.status && (
                  <StatusBadge
                    label={
                      t.has(`dashboard.tileStatus.${row.status}`)
                        ? t(`dashboard.tileStatus.${row.status}`)
                        : row.status
                    }
                    tone={row.tone}
                  />
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function recentOrder(
  row: RecyclerRecentOrder,
  occurredAt: string,
  t: ReturnType<typeof useTranslations>,
): RecentRow {
  return {
    id: row.id,
    href: row.href,
    primary: row.reference,
    secondary: `${row.contractor_name} · ${row.project_name} · ${occurredAt}`,
    value: row.vehicle_plate,
    status: dispatchState(row.state, t),
    tone: stateTone(row.state),
  };
}

function recentRecovery(
  row: RecyclerRecentRecovery,
  occurredAt: string,
  weight: (value: string | number) => string,
  t: ReturnType<typeof useTranslations>,
): RecentRow {
  return {
    id: row.id,
    href: row.href,
    primary: row.reference,
    secondary: `${sourceName(row.business_source, t)} · ${materialName(row.material_type, t)} · ${occurredAt}`,
    value: weight(row.weight_kg),
    status: "",
    tone: "positive",
  };
}

function recentOutbound(
  row: RecyclerRecentOutbound,
  occurredAt: string,
  weight: (value: string | number) => string,
  t: ReturnType<typeof useTranslations>,
): RecentRow {
  return {
    id: row.id,
    href: row.href,
    primary: row.reference,
    secondary: `${row.buyer_name} · ${materialName(row.material_type, t)} · ${occurredAt}`,
    value: weight(row.weight_kg),
    status: outboundState(row.state, t),
    tone: stateTone(row.state),
  };
}

function recentInvoice(
  row: RecyclerDashboardInvoice,
  money: (value: string | number, currency?: string) => string,
  t: ReturnType<typeof useTranslations>,
): RecentRow {
  return {
    id: row.id,
    href: "/billing",
    primary: row.invoice_no,
    secondary:
      row.kind === "SAAS"
        ? t("billing.kind.SAAS")
        : t("billing.kind.COMMISSION"),
    value: money(row.outstanding, row.currency),
    status: invoiceState(row.state, t),
    tone: stateTone(row.state),
  };
}

function dispatchState(
  state: string,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (state) {
    case "DRAFT":
      return t("dispatches.state.DRAFT");
    case "PENDING_ACCEPTANCE":
      return t("dispatches.state.PENDING_ACCEPTANCE");
    case "ACCEPTED":
      return t("dispatches.state.ACCEPTED");
    case "RELEASED":
      return t("dispatches.state.RELEASED");
    case "COLLECTED":
      return t("dispatches.state.COLLECTED");
    case "WEIGHED":
      return t("dispatches.state.WEIGHED");
    case "SETTLED":
      return t("dispatches.state.SETTLED");
    case "CANCELLED":
      return t("dispatches.state.CANCELLED");
    default:
      return state;
  }
}

function outboundState(
  state: string,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (state) {
    case "DRAFT":
      return t("recyclerBusiness.outboundState.DRAFT");
    case "CONFIRMED":
      return t("recyclerBusiness.outboundState.CONFIRMED");
    case "CANCELLED":
      return t("recyclerBusiness.outboundState.CANCELLED");
    default:
      return state;
  }
}

function invoiceState(
  state: string,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (state) {
    case "DRAFT":
      return t("billing.state.DRAFT");
    case "ISSUED":
      return t("billing.state.ISSUED");
    case "PARTIALLY_PAID":
      return t("billing.state.PARTIALLY_PAID");
    case "OVERDUE":
      return t("billing.state.OVERDUE");
    case "PAID":
      return t("billing.state.PAID");
    case "CANCELLED":
      return t("billing.state.CANCELLED");
    case "WRITTEN_OFF":
      return t("billing.state.WRITTEN_OFF");
    default:
      return state;
  }
}

function sourceName(
  source: string,
  t: ReturnType<typeof useTranslations>,
): string {
  return source === "PRIVATE"
    ? t("recyclerBusiness.source.PRIVATE")
    : t("recyclerBusiness.source.PLATFORM");
}

function materialName(
  material: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const names: Record<string, string> = {
    MIXED: t("recyclerBusiness.material.MIXED"),
    CONCRETE: t("recyclerBusiness.material.CONCRETE"),
    METAL: t("recyclerBusiness.material.METAL"),
    TIMBER: t("recyclerBusiness.material.TIMBER"),
    PLASTIC: t("recyclerBusiness.material.PLASTIC"),
    PAPER: t("recyclerBusiness.material.PAPER"),
    SOIL: t("recyclerBusiness.material.SOIL"),
    HAZARDOUS: t("recyclerBusiness.material.HAZARDOUS"),
    OTHER: t("recyclerBusiness.material.OTHER"),
  };
  return names[material] ?? material;
}

function stateTone(state: string): RecentRow["tone"] {
  if (["SETTLED", "CONFIRMED", "PAID"].includes(state)) return "positive";
  if (["CANCELLED", "OVERDUE", "WRITTEN_OFF"].includes(state)) return "danger";
  if (["PENDING_ACCEPTANCE", "ACCEPTED", "ISSUED"].includes(state)) {
    return "warning";
  }
  if (["RELEASED", "COLLECTED", "WEIGHED", "PARTIALLY_PAID"].includes(state)) {
    return "info";
  }
  return "neutral";
}

function RecyclerDashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      </div>
      <div className="grid gap-8 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-64" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
