"use client";

import { AlertTriangle, BarChart3, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { KpiCard } from "@/components/shared/kpi-card";
import type { ScheduleOverview } from "@/interfaces/schedule-planning";

/**
 * Three figures for the revision on screen, in plain words:
 * 进度 X%（计划 Y%）, 已完成 n/N, 延误 k.
 *
 * They replace four cards whose numbers did not add up: 任务总数 counted WBS
 * summary rows while 已完成 and the percentages left them out, and 需要关注
 * counted every task behind the planned curve, finished late or not yet due.
 * N is now the tasks the figures are calculated from (`counted_tasks`), and
 * 延误 is the rows the list marks 「已延误」 - past the planned finish and not
 * finished (spec 7.2.14.10).
 *
 * Pressing 延误 shows just those rows, each with its reason; pressing it again
 * shows them all.
 */
export function ScheduleFigures({
  summary,
  loading,
  onlyDelayed,
  onToggleDelayed,
}: {
  summary: ScheduleOverview["summary"] | undefined;
  loading: boolean;
  onlyDelayed: boolean;
  onToggleDelayed: () => void;
}) {
  const t = useTranslations("schedulePlanning.summary");
  // A summary that failed or has not arrived must not be drawn as "0 tasks,
  // 0% progress": a zero is indistinguishable from no answer once it is on
  // the card.
  const known = (value: string | number | null | undefined): value is string | number =>
    !loading && value !== null && value !== undefined;

  const actual = summary?.actual_progress;
  const planned = summary?.planned_progress;
  const done = summary?.completed_count;
  const counted = summary?.counted_tasks;
  const delayed = summary?.delayed_count;
  const late = summary?.completed_late_count ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3" data-slot="schedule-figures">
      <KpiCard
        icon={BarChart3}
        tone="cyan"
        label={t("progress")}
        value={known(actual) ? `${Number(actual)}%` : "-"}
        detail={known(planned) ? t("planned", { value: Number(planned) }) : undefined}
      />
      <KpiCard
        icon={Check}
        tone="green"
        label={t("completed")}
        value={known(done) && known(counted) ? `${done}/${counted}` : "-"}
        detail={known(done) && late > 0 ? t("lateFinished", { count: late }) : undefined}
      />
      <KpiCard
        icon={AlertTriangle}
        tone={known(delayed) && delayed > 0 ? "rose" : "slate"}
        label={t("delayed")}
        value={known(delayed) ? String(delayed) : "-"}
        detail={
          !known(delayed)
            ? undefined
            : onlyDelayed
              ? t("showingDelayed")
              : delayed > 0
                ? t("delayedHint")
                : t("noDelay")
        }
        onClick={known(delayed) && (delayed > 0 || onlyDelayed) ? onToggleDelayed : undefined}
        data-pressed={onlyDelayed ? "true" : "false"}
      />
    </div>
  );
}
