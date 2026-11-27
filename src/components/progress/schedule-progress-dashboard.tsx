"use client";

/**
 * 项目进度摘要's figures from the schedule (JB267, 客户 11-26 事项 8).
 *
 * 「当进入「项目进度摘要」页面时，直接显示：计划进度百分比、实际进度百分比、已完成
 * 任务数量、延误任务数量、各项施工任务的计划与实际进度对比图表。无须点击「新建摘要」，
 * 无须重复填写数据」: the top of the tab, for the project chosen, straight from
 * the project's schedule - the numbers 施工计划's cards show (one server
 * function, `overview_payload`), read again whenever the tab is opened or a
 * manager confirms progress. Nothing here is typed or saved; the summaries
 * the manager writes himself stay below it, unchanged.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, BarChart3, Check, Gauge } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ScheduleProgressCurveChart } from "@/components/progress/schedule-progress-curve";
import { useAuth } from "@/components/providers/auth-provider";
import { versionLine } from "@/components/schedule-planning/schedule-export-words";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FileActionButtons } from "@/components/shared/file-actions";
import { KpiCard } from "@/components/shared/kpi-card";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type { ScheduleProjectProgressPlan } from "@/interfaces/schedule-planning";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { absoluteUrl } from "@/lib/share";
import {
  archiveScheduleProgressReport,
  getProjectScheduleProgress,
  getScheduleProgressArchives,
  scheduleProgressArchiveFile,
  scheduleProgressReportFile,
} from "@/services/schedule-planning.service";

function percentText(value: string | undefined | null) {
  if (value == null || value === "") return "-";
  return `${Number(value)}%`;
}

function width(value: string | undefined | null) {
  const number = Number(value ?? 0);
  return `${Math.max(0, Math.min(Number.isFinite(number) ? number : 0, 100))}%`;
}

/** The four figures and the per-task chart of one schedule. */
export function ScheduleProgressFigures({ plan }: { plan: ScheduleProjectProgressPlan }) {
  const t = useTranslations("jb266");
  const tSummary = useTranslations("schedulePlanning.summary");
  const summary = plan.summary;
  const late = summary.completed_late_count ?? 0;
  const delayed = summary.delayed_count ?? 0;
  return (
    <div className="space-y-4" data-slot="schedule-progress-figures">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Gauge} tone="slate" label={t("plannedProgress")} value={percentText(summary.planned_progress)} detail={t("plannedProgressHint")} />
        <KpiCard icon={BarChart3} tone="cyan" label={t("actualProgress")} value={percentText(summary.actual_progress)} detail={t("actualProgressHint")} />
        <KpiCard
          icon={Check}
          tone="green"
          label={t("completedTasks")}
          value={`${summary.completed_count ?? 0}/${summary.counted_tasks ?? 0}`}
          detail={late > 0 ? tSummary("lateFinished", { count: late }) : undefined}
        />
        <KpiCard
          icon={AlertTriangle}
          tone={delayed > 0 ? "rose" : "slate"}
          label={t("delayedTasks")}
          value={String(delayed)}
          detail={delayed > 0 ? t("delayedHint") : tSummary("noDelay")}
        />
      </div>
      <section className="rounded-lg border bg-card p-3" aria-label={t("chartTitle")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t("chartTitle")}</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted-foreground/40" />{t("chartPlanned")}</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" />{t("chartActual")}</span>
          </div>
        </div>
        {plan.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTasks")}</p>
        ) : (
          <ul className="space-y-3" data-slot="schedule-progress-chart">
            {plan.tasks.map((task) => (
              <li key={task.id} className="grid gap-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center sm:gap-3">
                <p className="truncate text-sm" title={`${task.wbs_code} ${task.name}`}>
                  <span className="text-muted-foreground">{task.wbs_code}</span> {task.name}
                </p>
                <div className="space-y-1">
                  <Bar label={t("chartPlanned")} value={task.planned_progress} className="bg-muted-foreground/40" />
                  <Bar label={t("chartActual")} value={task.actual_progress} className={task.schedule_status === "DELAYED" ? "bg-destructive" : "bg-primary"} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* JB289 一 (客户 11-27c): the 计划 / 实际 曲线, below the 对比条, by itself. */}
      <ScheduleProgressCurveChart curve={plan.curve} />
    </div>
  );
}

/**
 * 预览 · 打印 · 导出 · 发送 of the block above, and its 【确认归档】 (JB289 三).
 *
 * 客户 11-27c: 「自动生成的计划与实际进度对比条及曲线图，必须支持预览、打印、导出及
 * 发送」, under his rule for 项目进度摘要 (10-28 事项10: 「只有确认归档后，才可以生成
 * PDF、打印、下载或转发给顾问」; Lucas 11-27: build it so). The live report is
 * previewed only; 【确认归档】 (with the PIN) keeps a frozen copy, and the copies
 * below are printed, exported and sent. Files and 归档 are the office's: never
 * on the phone.
 */
export function ScheduleProgressReportButtons({
  plan,
  project,
}: {
  plan: ScheduleProjectProgressPlan;
  project: string;
}) {
  const t = useTranslations("jb289");
  const draftWords = useTranslations("draftRecords");
  const locale = useLocale();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const archive = useMutation({
    mutationFn: () => archiveScheduleProgressReport(plan.plan_id, plan.revision!.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["schedule-progress-archives"] });
    },
  });
  if (user?.is_field_staff || !plan.revision) return null;
  const title = t("reportTitle", { plan: plan.plan_name });
  const revisionId = plan.revision.id;
  const draftRevision = plan.revision.status !== "CONFIRMED";
  return (
    <div className="flex flex-wrap items-center gap-2" data-slot="schedule-progress-report">
      <FileActionButtons
        label={t("reportLabel")}
        labelHint={t("reportHint")}
        // Preview only, always: what goes out is an archived copy.
        blockedReason={t("archiveFirst")}
        source={{
          load: () => scheduleProgressReportFile(plan.plan_id, locale, title, revisionId),
          title,
          project,
          link: absoluteUrl(`/progress?tab=summary&project=${project}`),
        }}
      />
      {can("progress.confirm") ? (
        <Button
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={draftRevision}
          disabledReason={draftRevision ? t("archiveDraft") : undefined}
          data-slot="schedule-progress-archive"
        >
          <Archive />
          {draftWords("confirmArchive")}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && setConfirming(false)}
        title={t("archiveTitle")}
        description={t("archiveBody")}
        confirmLabel={draftWords("confirmArchive")}
        confirmIcon={Archive}
        variant="default"
        isPending={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </div>
  );
}

/**
 * The archived copies of the report, newest first: when, who, which plan and
 * version, the two figures they froze - each with 预览 · 打印 · 导出 · 发送,
 * drawn from what it froze (JB289).
 */
export function ScheduleProgressArchives({ plan, project }: { plan: ScheduleProjectProgressPlan; project: string }) {
  const t = useTranslations("jb289");
  const tSchedule = useTranslations("schedulePlanning");
  const df = useDateFormat();
  const locale = useLocale();
  const { user } = useAuth();
  const archives = useQuery({
    queryKey: ["schedule-progress-archives", plan.plan_id],
    queryFn: () => getScheduleProgressArchives({ plan: plan.plan_id }),
    enabled: !user?.is_field_staff,
  });
  if (user?.is_field_staff) return null;
  const rows = archives.data?.results ?? [];
  return (
    <section className="rounded-lg border bg-card p-3" aria-label={t("archivesTitle")} data-slot="schedule-progress-archives">
      <h3 className="text-sm font-medium">{t("archivesTitle")}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{t("archivesHelp")}</p>
      <QueryFailedNote query={archives} what={t("archivesTitle")} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-slot="schedule-progress-archives-empty">
          {archives.isLoading ? "…" : t("archivesEmpty")}
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const when = df.dateTime(row.archived_at);
            const title = t("archiveTitleFile", { plan: row.plan_name, when });
            const version = versionLine(tSchedule("revision.number", { number: row.revision_number }), row.revision_label);
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-slot="schedule-progress-archive-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("archivedLine", { when, name: row.archived_by_name ?? "—" })}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("archivedFigures", {
                      plan: row.plan_name,
                      version,
                      planned: percentText(row.planned_progress),
                      actual: percentText(row.actual_progress),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FileActionButtons
                    source={{
                      load: () => scheduleProgressArchiveFile(row.id, locale, title),
                      title,
                      project,
                      link: absoluteUrl(`/progress?tab=summary&project=${project}`),
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Bar({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label} ${percentText(value)}`}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", className)} style={{ width: width(value) }} />
      </div>
      <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
        {label} {percentText(value)}
      </span>
    </div>
  );
}

/**
 * The block at the top of 项目进度摘要. One schedule shows directly; a project
 * with more than one shows a button per schedule, the first chosen.
 */
export function ScheduleProgressDashboard({ project }: { project: string }) {
  const t = useTranslations("jb266");
  const df = useDateFormat();
  const [chosen, setChosen] = useState("");
  const progress = useQuery({
    queryKey: ["schedule-project-progress", project],
    queryFn: () => getProjectScheduleProgress(project),
    enabled: Boolean(project),
  });
  if (!project) {
    return (
      <section className="surface-panel rounded-xl p-4 text-sm text-muted-foreground" data-slot="schedule-progress-dashboard">
        {t("chooseProject")}
      </section>
    );
  }
  const plans = progress.data?.plans ?? [];
  const plan = plans.find((row) => row.plan_id === chosen) ?? plans[0] ?? null;
  const confirmedAt = plan?.tasks
    .map((task) => task.progress_confirmed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return (
    <section className="surface-panel space-y-3 rounded-xl p-4 sm:p-5" data-slot="schedule-progress-dashboard">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t("dashboardTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("dashboardHelp")}</p>
        </div>
        {plan && (
          <p className="text-xs text-muted-foreground">
            {plan.plan_name}
            {plan.revision?.label ? ` · ${plan.revision.label}` : ""}
            {confirmedAt ? ` · ${t("lastConfirmed", { time: df.dateTime(confirmedAt) })}` : ""}
          </p>
        )}
      </header>
      <QueryFailedNote query={progress} what={t("dashboardTitle")} />
      {plans.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {plans.map((row) => (
            <Button
              key={row.plan_id}
              size="sm"
              variant={row.plan_id === plan?.plan_id ? "default" : "outline"}
              onClick={() => setChosen(row.plan_id)}
            >
              {row.plan_name}
            </Button>
          ))}
        </div>
      )}
      {plan && !progress.isLoading && !progress.isError ? (
        <ScheduleProgressReportButtons plan={plan} project={project} />
      ) : null}
      {progress.isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : progress.isError ? null : plan ? (
        <>
          <ScheduleProgressFigures plan={plan} />
          {/* JB289: the 确认归档 copies - the ones printed, exported and sent. */}
          <ScheduleProgressArchives plan={plan} project={project} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noPlan")}</p>
      )}
    </section>
  );
}
