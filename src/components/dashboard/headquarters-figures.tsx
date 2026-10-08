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
import { useCurrentProject } from "@/components/providers/current-project-provider";
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
import { ALL_PROJECTS_CHOICE } from "@/lib/project-context";
import { KpiCard } from "@/components/shared/kpi-card";
import type { Tone } from "@/lib/tones";

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
  // A company-wide figure counts every project; opened while the top bar is
  // on one, its list has to move the top bar to 全部项目 to show the same
  // number (B13, F8).
  const topBar = useCurrentProject();
  const everyProject = topBar.active && topBar.projectId ? ALL_PROJECTS_CHOICE : undefined;
  const href = (card: HeadquartersCard) =>
    cardHref(card, { project: cardProject(data, card) ?? everyProject, date: data.date });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label={t("projects")}
          value={format.number(totals.projects)}
          detail={t("activeProjects", { count: format.number(totals.active_projects) })}
          icon={Building2}
          tone={FIELD_TONE.projects}
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
            tone={FIELD_TONE[field]}
            danger={alarm && totals[field] > 0}
            href={href(field)}
            onOpen={field === "today_records" ? () => setBreakdown(true) : undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

/** Each figure's data colour (the canvas's six, by what it counts). */
const FIELD_TONE: Record<HeadquartersCountField | "projects", Tone> = {
  projects: "cyan",
  today_records: "blue",
  on_site_now: "green",
  pending_approvals: "amber",
  open_tasks: "purple",
  overdue_tasks: "rose",
  overdue_rectifications: "rose",
  material_receipts_today: "green",
};

function Tile({
  label,
  value,
  detail,
  icon,
  danger,
  tone,
  href,
  onOpen,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  danger?: boolean;
  tone: Tone;
  /** The list it counts; null when it opens a breakdown (`onOpen`). */
  href: string | null;
  onOpen?: () => void;
}) {
  // An alarm figure at zero is not an alarm: it stays quiet (U-029).
  const shown: Tone = tone === "rose" && !danger ? "slate" : tone;
  return (
    <KpiCard
      label={label}
      value={value}
      detail={detail}
      icon={icon}
      tone={shown}
      size="sm"
      href={href}
      onClick={href ? undefined : onOpen}
      data-headquarters-card
    />
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
      className="surface-panel flex min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-tone-orange/15 text-tone-orange-fg">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="mt-0.5 grid grid-cols-3 gap-2 text-sm">
          <span>
            <span className="block text-2xs text-muted-foreground">{t("records")}</span>
            <span className="font-semibold tabular-nums">{format.number(records)}</span>
          </span>
          <span>
            <span className="block text-2xs text-muted-foreground">{t("trips")}</span>
            <span className="font-semibold tabular-nums">{format.number(trips)}</span>
          </span>
          <span>
            <span className="block text-2xs text-muted-foreground">{weightLabel}</span>
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
                    <span className="block text-2xs text-muted-foreground">
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
