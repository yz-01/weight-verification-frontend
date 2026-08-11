"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  FileClock,
  HardHat,
  Images,
  Package,
  Recycle,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { ListHeader } from "@/components/shared/page-primitives";
import { useAuth } from "@/components/providers/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjects, getReceipts, getDispatches } from "@/services/contractor.service";
import {
  getDisposalRequests,
  getFieldTasks,
  getSiteEquipment,
  getSiteProgressRecords,
} from "@/services/contractor-ops.service";
import { getAttendance, getSafetyIncidents } from "@/services/site-operations.service";

interface ReportTile {
  key: string;
  feature: string;
  href: string;
  icon: typeof FileText;
  value: number | undefined;
  loading: boolean;
  descriptionKey: string;
}

/** Real contractor reporting entry point. It links to existing report pages and evidence lists. */
export function ContractorReportCenter() {
  const t = useTranslations();
  const format = useFormatter();
  const { user } = useAuth();
  const enabled = (feature: string) => user?.features.includes(feature) ?? false;
  const projects = useQuery({
    queryKey: ["projects", "report-center-count"],
    queryFn: () => getProjects({ page_size: 1 }),
    enabled: enabled("projects"),
  });
  const receipts = useQuery({
    queryKey: ["receipts", "report-center-count"],
    queryFn: () => getReceipts({ page_size: 1 }),
    enabled: enabled("material_receipts"),
  });
  const dispatches = useQuery({
    queryKey: ["dispatches", "report-center-count"],
    queryFn: () => getDispatches({ page_size: 1 }),
    enabled: enabled("waste_dispatches"),
  });
  const attendance = useQuery({
    queryKey: ["attendance", "report-center-count"],
    queryFn: () => getAttendance({ page_size: 1 }),
    enabled: enabled("attendance"),
  });
  const tasks = useQuery({
    queryKey: ["field-tasks", "report-center-count"],
    queryFn: () => getFieldTasks({ page_size: 1 }),
    enabled: enabled("field_tasks"),
  });
  const equipment = useQuery({
    queryKey: ["site-equipment", "report-center-count"],
    queryFn: () => getSiteEquipment({ page_size: 1 }),
    enabled: enabled("equipment"),
  });
  const progress = useQuery({
    queryKey: ["site-progress", "report-center-count"],
    queryFn: () => getSiteProgressRecords({ page_size: 1 }),
    enabled: enabled("progress"),
  });
  const safety = useQuery({
    queryKey: ["safety-incidents", "report-center-count"],
    queryFn: () => getSafetyIncidents({ page_size: 1 }),
    enabled: enabled("safety"),
  });
  const disposals = useQuery({
    queryKey: ["site-disposals", "report-center-count"],
    queryFn: () => getDisposalRequests({ page_size: 1 }),
    enabled: enabled("site_disposals"),
  });

  const tiles: ReportTile[] = [
    { key: "projects", feature: "projects", href: "/projects", icon: Package, value: projects.data?.count, loading: projects.isLoading, descriptionKey: "projectRecords" },
    { key: "materialQuantity", feature: "material_quantity_report", href: "/reports/material-quantity", icon: ClipboardList, value: receipts.data?.count, loading: receipts.isLoading, descriptionKey: "materialQuantity" },
    { key: "materialCost", feature: "material_cost_report", href: "/reports/material-cost", icon: FileText, value: receipts.data?.count, loading: receipts.isLoading, descriptionKey: "materialCost" },
    { key: "dispatches", feature: "waste_dispatches", href: "/dispatches", icon: Truck, value: dispatches.data?.count, loading: dispatches.isLoading, descriptionKey: "dispatches" },
    { key: "attendance", feature: "report_center", href: "/reports/contractor/attendance", icon: CalendarCheck, value: attendance.data?.count, loading: attendance.isLoading, descriptionKey: "attendance" },
    { key: "tasks", feature: "field_tasks", href: "/field-tasks", icon: Activity, value: tasks.data?.count, loading: tasks.isLoading, descriptionKey: "tasks" },
    { key: "equipment", feature: "report_center", href: "/reports/contractor/equipment", icon: HardHat, value: equipment.data?.count, loading: equipment.isLoading, descriptionKey: "equipment" },
    { key: "progress", feature: "report_center", href: "/reports/contractor/progress", icon: ChartNoAxesCombined, value: progress.data?.count, loading: progress.isLoading, descriptionKey: "progress" },
    { key: "photos", feature: "report_center", href: "/reports/contractor/photos", icon: Images, value: undefined, loading: false, descriptionKey: "photos" },
    { key: "safety", feature: "report_center", href: "/reports/contractor/safety", icon: ShieldAlert, value: safety.data?.count, loading: safety.isLoading, descriptionKey: "safety" },
    { key: "recycling", feature: "report_center", href: "/reports/contractor/recycling", icon: Recycle, value: disposals.data?.count, loading: disposals.isLoading, descriptionKey: "recycling" },
    { key: "consultant", feature: "report_center", href: "/reports/contractor/consultant", icon: ClipboardList, value: undefined, loading: false, descriptionKey: "consultant" },
    { key: "schedule", feature: "report_center", href: "/reports/contractor/schedule", icon: CalendarCheck, value: undefined, loading: false, descriptionKey: "schedule" },
    { key: "target", feature: "report_center", href: "/reports/contractor/target", icon: Activity, value: projects.data?.count, loading: projects.isLoading, descriptionKey: "target" },
    { key: "history", feature: "report_center", href: "/reports/contractor/history", icon: FileClock, value: undefined, loading: false, descriptionKey: "history" },
  ].filter((tile) => enabled(tile.feature));

  return (
    <div className="space-y-6">
      <ListHeader
        title={t("contractorReportCenter.title")}
        subtitle={t("contractorReportCenter.subtitle")}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className="group rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-primary">
                  {t("contractorReportCenter.open")}
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold">{t(`contractorReportCenter.tile.${tile.key}`)}</p>
              <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">
                {t(`contractorReportCenter.description.${tile.descriptionKey}`)}
              </p>
              {tile.loading ? (
                <Skeleton className="mt-3 h-7 w-16" />
              ) : tile.value !== undefined ? (
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  {format.number(tile.value)}
                </p>
              ) : null}
            </Link>
          );
        })}
      </section>
    </div>
  );
}
