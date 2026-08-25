"use client";

import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  ClipboardList,
  HardHat,
  ListChecks,
  Package,
  Recycle,
  Scale,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { ContractorDashboard } from "@/components/dashboard/contractor-dashboard";
import { RecyclerDashboard } from "@/components/recycler-business/recycler-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Portal } from "@/interfaces/auth";
import type { AdminDashboardSection } from "@/lib/admin-dashboard";
import { visibleNavigation } from "@/lib/navigation";
import {
  getDispatches,
  getProjects,
  getReceipts,
} from "@/services/contractor.service";
import {
  getDisposalRequests,
  getFieldTasks,
  getSiteEquipment,
  getSiteProgressRecords,
} from "@/services/contractor-ops.service";
import { getAttendance } from "@/services/site-operations.service";
import { getSafetyIncidents } from "@/services/site-operations.service";

interface DashboardStat {
  key: string;
  href: string;
  icon: LucideIcon;
  value: number | undefined;
  loading: boolean;
  enabled: boolean;
}

export function Dashboard({
  adminSection,
}: {
  adminSection?: AdminDashboardSection;
} = {}) {
  const t = useTranslations();
  const { user, can } = useAuth();

  if (!user) return null;

  const subtitleKey =
    user.portal === "MSE_ADMIN"
      ? "dashboard.platformSubtitle"
      : user.portal === "MSE_TRACE"
        ? "dashboard.contractorSubtitle"
        : "dashboard.recyclerSubtitle";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-foreground">
          {t("dashboard.greeting", { name: user.full_name })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(subtitleKey)}</p>
      </header>

      {user.portal === "MSE_ADMIN" ? (
        <AdminDashboard section={adminSection} />
      ) : user.portal === "MSE_TRACE" ? (
        // A contractor holding `dashboard.view` gets the aggregate: one request
        // for the day's feed, approvals, anomalies and timeline. Without the
        // grant, fall back to the per-resource counts, which need no permission
        // beyond the modules they already link to.
        can("dashboard.view") ? (
          <ContractorDashboard />
        ) : (
          <TraceDashboard features={user.features} />
        )
      ) : (
        <RecyclerDashboard features={user.features} />
      )}

      {user.portal === "MSE_TRACE" && (
        <QuickLinks
          portal={user.portal}
          features={user.features}
          permissions={user.permissions}
          isSuperuser={user.is_superuser}
        />
      )}
    </div>
  );
}

function TraceDashboard({ features }: { features: string[] }) {
  const projectsEnabled = features.includes("projects");
  const receiptsEnabled = features.includes("material_receipts");
  const dispatchesEnabled = features.includes("waste_dispatches");
  const attendanceEnabled = features.includes("attendance");
  const tasksEnabled = features.includes("field_tasks");
  const equipmentEnabled = features.includes("equipment");
  const progressEnabled = features.includes("progress");
  const safetyEnabled = features.includes("safety");
  const disposalEnabled = features.includes("site_disposals");

  const projects = useQuery({
    queryKey: ["projects", "dashboard-count"],
    queryFn: () => getProjects({ page_size: 1 }),
    enabled: projectsEnabled,
  });
  const receipts = useQuery({
    queryKey: ["receipts", "dashboard-count"],
    queryFn: () => getReceipts({ page_size: 1 }),
    enabled: receiptsEnabled,
  });
  const dispatches = useQuery({
    queryKey: ["dispatches", "dashboard-count"],
    queryFn: () => getDispatches({ page_size: 1 }),
    enabled: dispatchesEnabled,
  });
  const attendance = useQuery({
    queryKey: ["attendance", "dashboard-count"],
    queryFn: () => getAttendance({ page_size: 1 }),
    enabled: attendanceEnabled,
  });
  const tasks = useQuery({
    queryKey: ["field-tasks", "dashboard-count"],
    queryFn: () => getFieldTasks({ page_size: 1 }),
    enabled: tasksEnabled,
  });
  const equipment = useQuery({
    queryKey: ["site-equipment", "dashboard-count"],
    queryFn: () => getSiteEquipment({ page_size: 1 }),
    enabled: equipmentEnabled,
  });
  const progress = useQuery({
    queryKey: ["site-progress", "dashboard-count"],
    queryFn: () => getSiteProgressRecords({ page_size: 1 }),
    enabled: progressEnabled,
  });
  const safety = useQuery({
    queryKey: ["safety-incidents", "dashboard-count"],
    queryFn: () => getSafetyIncidents({ page_size: 1 }),
    enabled: safetyEnabled,
  });
  const disposals = useQuery({
    queryKey: ["site-disposals", "dashboard-count"],
    queryFn: () => getDisposalRequests({ page_size: 1 }),
    enabled: disposalEnabled,
  });

  return (
    <StatsGrid
      stats={[
        {
          key: "projects",
          href: "/projects",
          icon: Package,
          value: projects.data?.count,
          loading: projects.isLoading,
          enabled: projectsEnabled,
        },
        {
          key: "receipts",
          href: "/receipts",
          icon: ClipboardList,
          value: receipts.data?.count,
          loading: receipts.isLoading,
          enabled: receiptsEnabled,
        },
        {
          key: "dispatches",
          href: "/dispatches",
          icon: Truck,
          value: dispatches.data?.count,
          loading: dispatches.isLoading,
          enabled: dispatchesEnabled,
        },
        {
          key: "attendance",
          href: "/attendance",
          icon: CalendarCheck,
          value: attendance.data?.count,
          loading: attendance.isLoading,
          enabled: attendanceEnabled,
        },
        {
          key: "fieldTasks",
          href: "/field-tasks",
          icon: ListChecks,
          value: tasks.data?.count,
          loading: tasks.isLoading,
          enabled: tasksEnabled,
        },
        {
          key: "siteEquipment",
          href: "/site-equipment",
          icon: HardHat,
          value: equipment.data?.count,
          loading: equipment.isLoading,
          enabled: equipmentEnabled,
        },
        {
          key: "progress",
          href: "/progress",
          icon: Scale,
          value: progress.data?.count,
          loading: progress.isLoading,
          enabled: progressEnabled,
        },
        {
          key: "safety",
          href: "/safety",
          icon: ShieldAlert,
          value: safety.data?.count,
          loading: safety.isLoading,
          enabled: safetyEnabled,
        },
        {
          key: "siteDisposals",
          href: "/site-disposals",
          icon: Recycle,
          value: disposals.data?.count,
          loading: disposals.isLoading,
          enabled: disposalEnabled,
        },
      ]}
    />
  );
}

function StatsGrid({ stats }: { stats: DashboardStat[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const visible = stats.filter((stat) => stat.enabled);

  if (visible.length === 0) {
    return (
      <div className="border-y py-8 text-sm text-muted-foreground">
        {t("dashboard.noMetrics")}
      </div>
    );
  }

  return (
    <section
      aria-label={t("dashboard.metrics")}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {visible.map((stat) => {
        const Icon = stat.icon;
        return (
          <Link
            key={stat.key}
            href={stat.href}
            className="min-h-32 rounded-lg border bg-card p-5 shadow-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted-foreground">
                {t(`dashboard.tile.${stat.key}`)}
              </p>
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            {stat.loading ? (
              <Skeleton className="mt-5 h-8 w-20" />
            ) : (
              <p className="mt-4 text-3xl font-semibold tabular-nums text-foreground">
                {format.number(stat.value ?? 0)}
              </p>
            )}
          </Link>
        );
      })}
    </section>
  );
}

function QuickLinks({
  portal,
  features,
  permissions,
  isSuperuser,
}: {
  portal: Portal;
  features: string[];
  permissions: string[];
  isSuperuser: boolean;
}) {
  const t = useTranslations();
  const items = visibleNavigation(portal, features, permissions, isSuperuser)
    .flatMap((group) => group.items)
    .filter((item) => item.feature !== "dashboard")
    .slice(0, 6);

  if (items.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="dashboard-quick-links">
      <h2 id="dashboard-quick-links" className="text-sm font-semibold">
        {t("dashboard.quickLinks")}
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.feature}
              href={item.href}
              className="flex min-h-12 items-center gap-3 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span>{t(`nav.${item.labelKey}`)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
