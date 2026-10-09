"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { StatusBadge } from "@/components/shared/page-primitives";
import {
  lateLabelKey,
  taskStatusView,
  type TaskStatusKey,
} from "@/components/schedule-planning/task-status";
import type { ScheduleTask } from "@/interfaces/schedule-planning";
import { useDateFormat } from "@/lib/dates";
import { TONES, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

function utcDay(value: string): number {
  return Date.parse(value + "T00:00:00Z");
}

/** Today on the site's calendar, as the same UTC midnight the bars use. */
function todayUtc(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Each status's colour on the chart. Late and still open is rose; finished
 * late is amber, because the work is done; finished on time is green.
 */
const BAR_TONE: Record<TaskStatusKey, Tone> = {
  notStarted: "slate",
  inProgress: "cyan",
  delayed: "rose",
  completed: "green",
  completedLate: "amber",
};

/**
 * The schedule as bars: where each task was planned, how much of it is done,
 * and where today falls.
 *
 * The frame is the planned dates (the outlined bar); the fill is the
 * confirmed 完成%. A task's colour is its status from the server, the same
 * one the task list shows, so a task finished at 100% is never painted as
 * delayed. `today` is a prop so a test can pin it.
 */
export function ScheduleGantt({
  tasks,
  today = new Date(),
}: {
  tasks: ScheduleTask[];
  today?: Date;
}) {
  const t = useTranslations("schedulePlanning");
  const df = useDateFormat();
  const range = useMemo(() => {
    if (!tasks.length) return null;
    const start = Math.min(...tasks.map((task) => utcDay(task.planned_start)));
    const end = Math.max(...tasks.map((task) => utcDay(task.planned_end)));
    return {
      start,
      end,
      days: Math.max(Math.round((end - start) / DAY_MS) + 1, 1),
    };
  }, [tasks]);

  if (!range) {
    return (
      <div className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
        {t("state.noTasks")}
      </div>
    );
  }

  const now = todayUtc(today);
  const todayLeft =
    now >= range.start && now <= range.end
      ? (((now - range.start) / DAY_MS + 0.5) / range.days) * 100
      : null;

  return (
    <div className="surface-panel overflow-hidden rounded-xl" data-slot="schedule-gantt">
      <div className="overflow-x-auto">
        <div className="min-w-230">
          <div className="grid grid-cols-[15.625rem_1fr] border-b bg-muted/35 text-xs font-semibold text-muted-foreground">
            <div className="px-4 py-3">{t("field.task")}</div>
            <div className="flex items-center justify-between border-l px-4 py-3">
              <span>{df.date(new Date(range.start).toISOString())}</span>
              <span>{t("gantt.days", { count: range.days })}</span>
              <span>{df.date(new Date(range.end).toISOString())}</span>
            </div>
          </div>
          {tasks.map((task) => {
            const status = taskStatusView(task);
            const lateKey = lateLabelKey(status);
            const tone = TONES[BAR_TONE[status.key]];
            const left =
              (((utcDay(task.planned_start) - range.start) / DAY_MS) / range.days) * 100;
            const width = Math.max((task.duration_days / range.days) * 100, 1.2);
            const actual = Math.max(0, Math.min(Number(task.actual_progress), 100));
            return (
              <div
                key={task.id}
                data-status={status.key}
                className="grid min-h-16 grid-cols-[15.625rem_1fr] border-b last:border-0"
              >
                <div className="min-w-0 px-4 py-3">
                  <p className="truncate text-sm font-medium" title={task.wbs_code + " " + task.name}>
                    <span className="text-muted-foreground">{task.wbs_code}</span> {task.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {task.duration_days} {t("common.day")}
                    </span>
                    {lateKey && (
                      <StatusBadge label={t(lateKey, { count: status.days })} tone={status.tone} />
                    )}
                  </div>
                </div>
                <div className="relative border-l bg-muted/10 px-4 py-4">
                  {todayLeft !== null && (
                    <span
                      aria-hidden
                      data-slot="gantt-today"
                      className="absolute inset-y-0 w-px bg-foreground/40"
                      style={{ left: "calc(" + todayLeft + "% + 1rem)" }}
                    />
                  )}
                  <div
                    className={cn("absolute top-5 h-7 overflow-hidden rounded-md border", tone.surface)}
                    style={{
                      left: "calc(" + left + "% + 1rem)",
                      width: "calc(" + width + "% - 0.25rem)",
                    }}
                    title={task.wbs_code + " " + df.date(task.planned_start) + " - " + df.date(task.planned_end)}
                  >
                    <div className={cn("h-full opacity-70", tone.bar)} style={{ width: actual + "%" }} />
                    <span className="absolute inset-0 grid place-items-center text-2xs font-semibold tabular-nums text-foreground">
                      {actual}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <LegendItem swatch={cn("border", TONES.cyan.surface)} label={t("gantt.planned")} />
        <LegendItem swatch={cn("opacity-70", TONES.cyan.bar)} label={t("gantt.actual")} />
        <LegendItem swatch={TONES.green.bar} label={t("status.completed")} />
        <LegendItem swatch={TONES.amber.bar} label={t("status.completedLate")} />
        <LegendItem swatch={TONES.rose.bar} label={t("status.delayed")} />
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-foreground/40" />
          {t("gantt.today")}
        </span>
      </div>
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", swatch)} />
      {label}
    </span>
  );
}
