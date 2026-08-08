"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { StatusBadge } from "@/components/shared/page-primitives";
import type { ScheduleTask } from "@/interfaces/schedule-planning";
import { useDateFormat } from "@/lib/dates";

const DAY_MS = 86_400_000;

function utcDay(value: string): number {
  return Date.parse(value + "T00:00:00Z");
}

export function ScheduleGantt({ tasks }: { tasks: ScheduleTask[] }) {
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
    return <EmptyState text={t("state.noTasks")} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[250px_1fr] border-b bg-muted/35 text-xs font-semibold text-muted-foreground">
            <div className="px-4 py-3">{t("field.task")}</div>
            <div className="flex items-center justify-between border-l px-4 py-3">
              <span>{df.date(new Date(range.start).toISOString())}</span>
              <span>{t("gantt.days", { count: range.days })}</span>
              <span>{df.date(new Date(range.end).toISOString())}</span>
            </div>
          </div>
          {tasks.map((task) => {
            const left =
              (((utcDay(task.planned_start) - range.start) / DAY_MS) /
                range.days) *
              100;
            const width = Math.max(
              (task.duration_days / range.days) * 100,
              1.2,
            );
            const actual = Math.max(
              0,
              Math.min(Number(task.actual_progress), 100),
            );
            return (
              <div
                key={task.id}
                className="grid min-h-16 grid-cols-[250px_1fr] border-b last:border-0"
              >
                <div className="min-w-0 px-4 py-3">
                  <p className="truncate text-sm font-medium">
                    {task.wbs_code} - {task.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {task.duration_days} {t("common.day")}
                    </span>
                    {task.is_delayed && (
                      <StatusBadge
                        label={t("status.delayed")}
                        tone="danger"
                      />
                    )}
                  </div>
                </div>
                <div className="relative border-l bg-muted/10 px-4 py-4">
                  <div
                    className={
                      task.is_delayed
                        ? "absolute top-5 h-7 overflow-hidden rounded-md bg-destructive/15 ring-1 ring-destructive/30"
                        : "absolute top-5 h-7 overflow-hidden rounded-md bg-primary/15 ring-1 ring-primary/25"
                    }
                    style={{
                      left: "calc(" + left + "% + 1rem)",
                      width: "calc(" + width + "% - 0.25rem)",
                    }}
                    title={
                      task.wbs_code +
                      " " +
                      task.planned_start +
                      " - " +
                      task.planned_end
                    }
                  >
                    <div
                      className={
                        task.is_delayed
                          ? "h-full bg-destructive/70"
                          : "h-full bg-primary/70"
                      }
                      style={{ width: actual + "%" }}
                    />
                    <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-foreground">
                      {actual}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/70" />
          {t("gantt.actual")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/15 ring-1 ring-primary/30" />
          {t("gantt.planned")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-destructive/70" />
          {t("status.delayed")}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/15 p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
