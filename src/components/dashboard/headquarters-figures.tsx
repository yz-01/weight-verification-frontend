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
import { cardHref, cardProject, type HeadquartersCard } from "@/lib/headquarters-links";
import { cn } from "@/lib/utils";

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
 * 全公司数字 (C13). Every card goes straight to the thing it counts (F8, Q22):
 * the module's list with the filter the figure was counted by - 待审批 to
 * 总部集中审批, 逾期整改 to the overdue hazards, 今日材料进场 to today's
 * deliveries - on the reader's one project, or across every project they
 * see. Never to a project's dashboard. 今日现场记录 is ten kinds of record no
 * single list holds, so it opens its breakdown by project and kind.
 * 原废料订单 and 原工地清运 are two cards with their own 数量 / 车次 / 重量 and
 * no combined figure (D06).
 */
export function HeadquartersFigures({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.figures");
  const format = useFormatter();
  const [breakdown, setBreakdown] = useState(false);
  const totals = data.totals;
  const href = (card: HeadquartersCard) =>
    cardHref(card, { project: cardProject(data, card), date: data.date });

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          label={t("projects")}
          value={format.number(totals.projects)}
          detail={t("activeProjects", { count: format.number(totals.active_projects) })}
          icon={Building2}
          href={href("projects")}
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
            href={href(field)}
            onOpen={field === "today_records" ? () => setBreakdown(true) : undefined}
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
          href={href("waste_dispatches") ?? "/waste-clearance"}
        />
        <ClearanceCard
          label={t("siteDisposals")}
          icon={Truck}
          records={totals.site_disposals.records}
          trips={totals.site_disposals.trips}
          weight={totals.site_disposals.weight_kg}
          weightLabel={t("weightKg")}
          href={href("site_disposals") ?? "/waste-clearance"}
        />
      </div>
      {breakdown && <TodayRecordsDialog data={data} onClose={() => setBreakdown(false)} />}
    </>
  );
}

const TILE_CLASS =
  "min-w-0 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Tile({
  label,
  value,
  detail,
  icon: Icon,
  danger,
  href,
  onOpen,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  danger?: boolean;
  /** The list it counts; null when it opens a breakdown (`onOpen`). */
  href: string | null;
  onOpen?: () => void;
}) {
  const body = (
    <>
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
    </>
  );
  const className = cn(TILE_CLASS, danger && "border-destructive/40 bg-destructive/5");
  if (href) {
    return (
      <Link href={href} className={className} data-headquarters-card>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={className} data-headquarters-card>
      {body}
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
  href,
}: {
  label: string;
  icon: LucideIcon;
  records: number;
  trips: number;
  weight: string;
  weightLabel: string;
  href: string;
}) {
  const t = useTranslations("headquarters.figures");
  const format = useFormatter();
  return (
    <Link
      href={href}
      data-headquarters-card
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
    </Link>
  );
}

/**
 * 今日现场记录, by project and kind (汇总 = 明细). The one card that does not
 * lead to a list: no single list holds all ten kinds.
 */
function TodayRecordsDialog({
  data,
  onClose,
}: {
  data: HeadquartersOverview;
  onClose: () => void;
}) {
  const t = useTranslations("headquarters.figures");
  const kinds = useTranslations("headquarters.recordKind");
  const format = useFormatter();
  const n = (value: number) => format.number(value);

  const kindSummary = (counts: HeadquartersCounts["today_records_by_kind"]) =>
    (Object.entries(counts) as Array<[TodayRecordKind, number]>)
      .filter(([, value]) => value > 0)
      .map(([kind, value]) => `${kinds(kind)} ${n(value)}`)
      .join(" · ");

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("field.today_records")}</DialogTitle>
          <DialogDescription>{t("todayRecordsHelp")}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {kindSummary(data.totals.today_records_by_kind) || t("nothingToday")}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("project")}</TableHead>
              <TableHead className="text-right">{t("value")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.projects.map((project) => (
              <TableRow key={project.id} data-drill-row>
                <TableCell>
                  <span className="font-medium">{project.name}</span>
                  {project.today_records > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      {kindSummary(project.today_records_by_kind)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {n(project.today_records)}
                </TableCell>
              </TableRow>
            ))}
            {data.has_other && (
              <TableRow>
                <TableCell className="text-muted-foreground">{t("other")}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {n(data.other.today_records)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">{t("total")}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {n(data.totals.today_records)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
