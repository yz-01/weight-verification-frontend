"use client";

/**
 * 项目进度摘要's 工程进度曲线图, drawn by itself (JB289 一, 客户 11-27c).
 *
 * 「请根据施工计划及项目经理每次确认的实际进度，自动生成：计划进度曲线（Planned
 * Progress）、实际进度曲线（Actual Progress）。采用不同颜色显示，横轴为日期，纵轴为
 * 完成百分比，自动更新及保留历史进度变化，无须重复填写或手动建立图表。」
 *
 * Both lines come from the server (`get_project_progress` → `curve`): the
 * planned one is the schedule's own rule by day (the 对比条's 计划 %), the
 * actual one a step through every 「确认实际进度」 in the 操作记录 - a later
 * confirmation adds a point and never moves an earlier one. Nothing here is
 * typed or saved; the hand-made summaries and their charts stay below.
 */

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  ScheduleCurveActualPoint,
  ScheduleProgressCurve,
} from "@/interfaces/schedule-planning";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };
const PLANNED_COLOUR = "var(--chart-2)";
const ACTUAL_COLOUR = "var(--chart-5)";

/** A `YYYY-MM-DD` day as the UTC midnight the axis counts in. */
export function dayValue(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayText(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function percent(value: number | string | null | undefined): string {
  if (value == null || value === "") return "—";
  return `${Number(value)}%`;
}

export interface CurveRow {
  t: number;
  planned?: number;
  actual?: number;
  /** The confirmation this point is, for the tooltip. */
  confirmation?: ScheduleCurveActualPoint;
}

/**
 * The chart's rows: one per planned day and one per actual point, in date
 * order. A day with both carries both; a day with several confirmations has
 * a row for each, so every change of the history is on the line.
 */
export function curveRows(curve: ScheduleProgressCurve): CurveRow[] {
  const planned = new Map(curve.planned.map((point) => [point.date, Number(point.value)]));
  const rows: CurveRow[] = [];
  const actualDays = new Set<string>();
  for (const point of curve.actual) {
    actualDays.add(point.date);
    rows.push({
      t: dayValue(point.date),
      planned: planned.get(point.date),
      actual: Number(point.value),
      confirmation: point.at ? point : undefined,
    });
  }
  for (const [date, value] of planned) {
    if (!actualDays.has(date)) rows.push({ t: dayValue(date), planned: value });
  }
  // Stable: rows of one day keep the order the confirmations were made in.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.t - b.row.t || a.index - b.index)
    .map(({ row }) => row);
}

export function ScheduleProgressCurveChart({ curve }: { curve: ScheduleProgressCurve | undefined }) {
  const t = useTranslations("jb289");
  if (!curve || curve.planned.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-3" aria-label={t("curveTitle")} data-slot="schedule-progress-curve">
        <h3 className="mb-1 text-sm font-medium">{t("curveTitle")}</h3>
        <p className="text-sm text-muted-foreground" data-slot="curve-empty">{t("noCurve")}</p>
      </section>
    );
  }
  const rows = curveRows(curve);
  const confirmed = curve.actual.some((point) => point.at);
  const today = curve.today ? dayValue(curve.today) : null;
  const start = rows[0]?.t ?? 0;
  const end = rows.at(-1)?.t ?? start;
  return (
    <section className="rounded-lg border bg-card p-3" aria-label={t("curveTitle")} data-slot="schedule-progress-curve">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{t("curveTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("curveHelp")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-slot="curve-legend">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: PLANNED_COLOUR }} />
            {t("curvePlanned")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: ACTUAL_COLOUR }} />
            {t("curveActual")}
          </span>
        </div>
      </div>
      <div className="h-64 w-full" data-slot="curve-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="t"
              scale="time"
              domain={[start, end]}
              tickFormatter={(value: number) => dayText(value)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            {today !== null && today >= start && today <= end ? (
              <ReferenceLine x={today} stroke="var(--muted-foreground)" strokeDasharray="2 3" label={{ value: t("today"), position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }} />
            ) : null}
            <Tooltip content={<CurveTooltip />} />
            <Line
              type="linear"
              dataKey="planned"
              name={t("curvePlanned")}
              stroke={PLANNED_COLOUR}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="actual"
              name={t("curveActual")}
              stroke={ACTUAL_COLOUR}
              strokeWidth={2.5}
              dot={{ r: 3, fill: ACTUAL_COLOUR }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("curveAxes")}</p>
      {!confirmed ? (
        <p className="mt-1 text-sm text-muted-foreground" data-slot="curve-no-confirmation">{t("noConfirmation")}</p>
      ) : null}
    </section>
  );
}

function CurveTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CurveRow }>;
  label?: number;
}) {
  const t = useTranslations("jb289");
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const confirmation = row.confirmation;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <p className="font-medium">{dayText(label ?? row.t)}</p>
      {row.planned != null ? <p>{t("tooltipLine", { label: t("curvePlanned"), value: percent(row.planned) })}</p> : null}
      {row.actual != null ? <p>{t("tooltipLine", { label: t("curveActual"), value: percent(row.actual) })}</p> : null}
      {confirmation ? (
        <p className="mt-1 text-muted-foreground">
          {t("confirmationLine", {
            name: confirmation.actor_name || "—",
            task: `${confirmation.task_wbs_code} ${confirmation.task_name}`.trim(),
            before: percent(confirmation.progress_before),
            after: percent(confirmation.progress_after),
          })}
        </p>
      ) : null}
    </div>
  );
}
