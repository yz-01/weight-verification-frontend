"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { StatusBadge } from "@/components/shared/page-primitives";
import { lateLabelKey, taskStatusView } from "@/components/schedule-planning/task-status";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ScheduleRevision, ScheduleTask } from "@/interfaces/schedule-planning";
import { useDateFormat } from "@/lib/dates";

/**
 * The tasks of the revision on screen, in plain columns: 任务, 开始, 结束,
 * 天数, 完成%, 状态.
 *
 * A late task says why in the same cell as its badge - 「计划 9月30日 完成，
 * 还没做完」 or 「计划 9月30日，实际 10月3日 完成」 - so no delay on the page
 * has to be taken on trust. 完成% says when it is backed by site records.
 *
 * The row actions are the ones the API allows at this revision's stage:
 * 确认进度 on a confirmed revision; 编辑 / 移除 on a draft.
 */
export function ScheduleTaskTable({
  rows,
  revision,
  canManage,
  canConfirm,
  emptyText,
  onEdit,
  onProgress,
  onRemove,
}: {
  rows: ScheduleTask[];
  revision: ScheduleRevision | null;
  canManage: boolean;
  canConfirm: boolean;
  /** What an empty list says: no tasks yet, or no delayed ones. */
  emptyText: string;
  onEdit: (row: ScheduleTask) => void;
  onProgress: (row: ScheduleTask) => void;
  onRemove: (row: ScheduleTask) => void;
}) {
  const t = useTranslations("schedulePlanning");
  const df = useDateFormat();
  const depths = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const result = new Map<string, number>();
    rows.forEach((row) => {
      let depth = 0;
      let parent = row.parent ? byId.get(row.parent) : undefined;
      const seen = new Set<string>();
      while (parent && !seen.has(parent.id) && depth < 8) {
        seen.add(parent.id);
        depth += 1;
        parent = parent.parent ? byId.get(parent.parent) : undefined;
      }
      result.set(row.id, depth);
    });
    return result;
  }, [rows]);

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const confirmed = revision?.status === "CONFIRMED";
  const draft = revision?.status === "DRAFT";
  const hasActions = (canConfirm && confirmed) || (canManage && draft);

  return (
    <div className="surface-panel overflow-hidden rounded-xl" data-slot="schedule-task-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("field.task")}</TableHead>
            <TableHead>{t("field.start")}</TableHead>
            <TableHead>{t("field.end")}</TableHead>
            <TableHead className="text-right">{t("field.days")}</TableHead>
            <TableHead>{t("field.done")}</TableHead>
            <TableHead>{t("field.status")}</TableHead>
            {hasActions && <TableHead className="text-right">{t("field.actions")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const status = taskStatusView(row);
            const lateKey = lateLabelKey(status);
            const weight = Number(row.weight);
            return (
              <TableRow key={row.id} data-status={status.key}>
                <TableCell>
                  <div style={{ paddingLeft: (depths.get(row.id) ?? 0) * 18 }}>
                    <p className="max-w-72 truncate font-medium" title={row.wbs_code + " " + row.name}>
                      <span className="text-muted-foreground">{row.wbs_code}</span> {row.name}
                    </p>
                    {(row.description || weight !== 1) && (
                      <p className="max-w-72 truncate text-xs text-muted-foreground">
                        {[weight !== 1 ? t("field.weightValue", { value: row.weight }) : "", row.description]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{df.date(row.planned_start)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{df.date(row.planned_end)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.duration_days}</TableCell>
                <TableCell>
                  <DoneValue
                    value={Number(row.actual_progress)}
                    title={t("field.plannedToday", { value: row.planned_progress })}
                  />
                  {row.progress_links.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("field.linkedRecords", { count: row.progress_links.length })}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={lateKey ? t(lateKey, { count: status.days }) : t(`status.${status.key}`)}
                    tone={status.tone}
                  />
                  {status.key === "delayed" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("why.delayed", { date: df.date(row.planned_end) })}
                    </p>
                  )}
                  {status.key === "completedLate" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("why.completedLate", {
                        planned: df.date(row.planned_end),
                        actual: df.date(row.actual_end ?? ""),
                      })}
                    </p>
                  )}
                </TableCell>
                {hasActions && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      {canConfirm && confirmed && (
                        <Button size="sm" variant="outline" onClick={() => onProgress(row)}>
                          <Check />{t("action.confirmProgress")}
                        </Button>
                      )}
                      {canManage && draft && (
                        <>
                          <Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => onEdit(row)}>
                            <Pencil />
                          </Button>
                          <Button size="icon-sm" variant="ghost" className="text-destructive" title={t("action.remove")} onClick={() => onRemove(row)}>
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DoneValue({ value, title }: { value: number; title: string }) {
  const safe = Math.max(0, Math.min(value, 100));
  return (
    <div className="w-28" title={title}>
      <p className="mb-1 text-xs tabular-nums">{safe.toFixed(1)}%</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: safe + "%" }} />
      </div>
    </div>
  );
}
