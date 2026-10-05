"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  PackageCheck,
  Recycle,
  Truck,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  HeadquartersCountField,
  HeadquartersCounts,
  HeadquartersOverview,
  TodayRecordKind,
} from "@/interfaces/headquarters";
import { drillHref, projectDashboardHref } from "@/lib/headquarters-links";
import { cn } from "@/lib/utils";

type Drill = HeadquartersCountField | "projects" | "waste_dispatches" | "site_disposals";

const COUNT_TILES: Array<{
  field: HeadquartersCountField;
  icon: LucideIcon;
  /** Red when above zero: the two 逾期 figures (U-029). */
  alarm?: boolean;
}> = [
  { field: "today_records", icon: ClipboardList },
  { field: "on_site_now", icon: Users },
  { field: "pending_approvals", icon: ClipboardCheck },
  { field: "open_tasks", icon: ClipboardList },
  { field: "overdue_tasks", icon: AlarmClock, alarm: true },
  { field: "overdue_rectifications", icon: FileWarning, alarm: true },
  { field: "material_receipts_today", icon: PackageCheck },
];

/**
 * 全公司数字 (C13). Every figure opens the projects it is made of, and the
 * rows add up to it - the server counts the total as their sum, plus an
 * 「其他」 row for anything tied to no project (a company-wide approval).
 * 原废料订单 and 原工地清运 are two cards with their own 数量 / 车次 / 重量 and
 * no combined figure (D06).
 */
export function HeadquartersFigures({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.figures");
  const format = useFormatter();
  const [open, setOpen] = useState<Drill | null>(null);
  const totals = data.totals;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          label={t("projects")}
          value={format.number(totals.projects)}
          detail={t("activeProjects", { count: format.number(totals.active_projects) })}
          icon={Building2}
          onOpen={() => setOpen("projects")}
        />
        {COUNT_TILES.map(({ field, icon, alarm }) => (
          <Tile
            key={field}
            label={t(`field.${field}`)}
            value={format.number(totals[field])}
            detail={
              field === "on_site_now"
                ? t("onSiteSplit", {
                    app: format.number(totals.app_on_site),
                    gate: format.number(totals.gate_on_site),
                  })
                : undefined
            }
            icon={icon}
            danger={alarm && totals[field] > 0}
            onOpen={() => setOpen(field)}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <ClearanceCard
          label={t("wasteDispatches")}
          icon={Recycle}
          records={totals.waste_dispatches.records}
          trips={totals.waste_dispatches.trips}
          weight={totals.waste_dispatches.weighed_kg}
          weightLabel={t("weighedKg")}
          onOpen={() => setOpen("waste_dispatches")}
        />
        <ClearanceCard
          label={t("siteDisposals")}
          icon={Truck}
          records={totals.site_disposals.records}
          trips={totals.site_disposals.trips}
          weight={totals.site_disposals.weight_kg}
          weightLabel={t("weightKg")}
          onOpen={() => setOpen("site_disposals")}
        />
      </div>
      {open && (
        <DrillDialog data={data} drill={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function Tile({
  label,
  value,
  detail,
  icon: Icon,
  danger,
  onOpen,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  danger?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "min-w-0 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        danger && "border-destructive/40 bg-destructive/5",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4 shrink-0 text-muted-foreground", danger && "text-destructive")} aria-hidden />
      </span>
      <span className={cn("mt-1 block text-xl font-semibold tabular-nums", danger && "text-destructive")}>
        {value}
      </span>
      {detail && (
        <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
      )}
    </button>
  );
}

function ClearanceCard({
  label,
  icon: Icon,
  records,
  trips,
  weight,
  weightLabel,
  onOpen,
}: {
  label: string;
  icon: LucideIcon;
  records: number;
  trips: number;
  weight: string;
  weightLabel: string;
  onOpen: () => void;
}) {
  const t = useTranslations("headquarters.figures");
  const format = useFormatter();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="mt-0.5 grid grid-cols-3 gap-2 text-sm">
          <span>
            <span className="block text-[11px] text-muted-foreground">{t("records")}</span>
            <span className="font-semibold tabular-nums">{format.number(records)}</span>
          </span>
          <span>
            <span className="block text-[11px] text-muted-foreground">{t("trips")}</span>
            <span className="font-semibold tabular-nums">{format.number(trips)}</span>
          </span>
          <span>
            <span className="block text-[11px] text-muted-foreground">{weightLabel}</span>
            <span className="font-semibold tabular-nums">
              {format.number(Number(weight), { maximumFractionDigits: 2 })}
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

/** One figure, by project, adding up to the figure (汇总 = 明细). */
function DrillDialog({
  data,
  drill,
  onClose,
}: {
  data: HeadquartersOverview;
  drill: Drill;
  onClose: () => void;
}) {
  const t = useTranslations("headquarters.figures");
  const kinds = useTranslations("headquarters.recordKind");
  const format = useFormatter();
  const n = (value: number) => format.number(value);
  const kg = (value: string) => format.number(Number(value), { maximumFractionDigits: 2 });
  const title =
    drill === "projects"
      ? t("projects")
      : drill === "waste_dispatches"
        ? t("wasteDispatches")
        : drill === "site_disposals"
          ? t("siteDisposals")
          : t(`field.${drill}`);
  const clearance = drill === "waste_dispatches" || drill === "site_disposals";

  const kindSummary = (counts: HeadquartersCounts["today_records_by_kind"]) =>
    (Object.entries(counts) as Array<[TodayRecordKind, number]>)
      .filter(([, value]) => value > 0)
      .map(([kind, value]) => `${kinds(kind)} ${n(value)}`)
      .join(" · ");

  const values = (row: HeadquartersCounts) => {
    if (drill === "waste_dispatches") {
      const part = row.waste_dispatches;
      return [n(part.records), n(part.trips), kg(part.weighed_kg)];
    }
    if (drill === "site_disposals") {
      const part = row.site_disposals;
      return [n(part.records), n(part.trips), kg(part.weight_kg)];
    }
    if (drill === "projects") return [];
    return [n(row[drill])];
  };
  const headings = clearance
    ? [t("records"), t("trips"), drill === "waste_dispatches" ? t("weighedKg") : t("weightKg")]
    : drill === "projects"
      ? [t("status")]
      : [t("value")];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {drill === "today_records"
              ? t("todayRecordsHelp")
              : drill === "overdue_tasks" || drill === "overdue_rectifications"
                ? t("overdueHelp")
                : clearance
                  ? t("clearanceHelp")
                  : t("drillHelp")}
          </DialogDescription>
        </DialogHeader>
        {drill === "today_records" && (
          <p className="text-xs text-muted-foreground">
            {kindSummary(data.totals.today_records_by_kind) || t("nothingToday")}
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("project")}</TableHead>
              {headings.map((heading) => (
                <TableHead key={heading} className="text-right">
                  {heading}
                </TableHead>
              ))}
              <TableHead className="text-right">
                <span className="sr-only">{t("open")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.projects.map((project) => (
              <TableRow key={project.id} data-drill-row>
                <TableCell>
                  <span className="font-medium">{project.name}</span>
                  {drill === "today_records" && project.today_records > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      {kindSummary(project.today_records_by_kind)}
                    </span>
                  )}
                </TableCell>
                {drill === "projects" ? (
                  <TableCell className="text-right text-xs">
                    {t(`projectStatus.${project.status}`)}
                  </TableCell>
                ) : (
                  values(project).map((value, index) => (
                    <TableCell key={index} className="text-right tabular-nums">
                      {value}
                    </TableCell>
                  ))
                )}
                <TableCell className="text-right">
                  <Link
                    href={
                      drill === "projects" || clearance
                        ? projectDashboardHref(project.id)
                        : drillHref(drill, project.id)
                    }
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("open")}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {data.has_other && drill !== "projects" && (
              <TableRow>
                <TableCell className="text-muted-foreground">{t("other")}</TableCell>
                {values(data.other).map((value, index) => (
                  <TableCell key={index} className="text-right tabular-nums">
                    {value}
                  </TableCell>
                ))}
                <TableCell className="text-right" />
              </TableRow>
            )}
          </TableBody>
          {drill !== "projects" && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">{t("total")}</TableCell>
                {values(data.totals).map((value, index) => (
                  <TableCell key={index} className="text-right font-semibold tabular-nums">
                    {value}
                  </TableCell>
                ))}
                <TableCell className="text-right" />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </DialogContent>
    </Dialog>
  );
}
