"use client";

/**
 * 施工计划's Excel / PDF in the reader's words (JB289 二, 客户 11-27c).
 *
 * 「目前施工计划的Excel预览缺少以下关联资料：实际完成日期、任务完成状态、顾问审批编号及
 * 审批结果、关联现场记录编号、进度确认人及确认时间、施工计划版本」: every column name,
 * the status words (the task list's own) and the 施工计划版本 line under the
 * title, from the catalogue - in whichever of the four languages the reader
 * uses. Before this the headings were English whatever the reader's language.
 */

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import type { ScheduleRevision, ScheduleTaskStatus } from "@/interfaces/schedule-planning";
import {
  SCHEDULE_EXPORT_COLUMNS,
  type ScheduleExportColumn,
  type ScheduleExportWords,
} from "@/services/schedule-planning.service";

const STATUS_KEYS: Record<ScheduleTaskStatus, string> = {
  NOT_STARTED: "notStarted",
  IN_PROGRESS: "inProgress",
  DELAYED: "delayed",
  COMPLETED: "completed",
  COMPLETED_LATE: "completedLate",
};

/** 「版本 2 · 第二次修订」: the number, and the label when it says more. */
export function versionLine(number: string, label: string | undefined): string {
  const named = (label ?? "").trim();
  return named && named !== number ? `${number} · ${named}` : number;
}

export function useScheduleExportWords() {
  const t = useTranslations("jb289");
  const tSchedule = useTranslations("schedulePlanning");
  const locale = useLocale();
  return useCallback(
    (revision: Pick<ScheduleRevision, "revision_number" | "label">): ScheduleExportWords => {
      const columns = Object.fromEntries(
        SCHEDULE_EXPORT_COLUMNS.map((key) => [key, t(`column.${key}`)]),
      ) as Record<ScheduleExportColumn, string>;
      const status = Object.fromEntries(
        (Object.keys(STATUS_KEYS) as ScheduleTaskStatus[]).map((code) => [
          code,
          tSchedule(`status.${STATUS_KEYS[code]}`),
        ]),
      ) as Record<ScheduleTaskStatus, string>;
      const version = versionLine(
        tSchedule("revision.number", { number: revision.revision_number }),
        revision.label,
      );
      return {
        lang: locale,
        title: t("exportTitle"),
        subtitle: t("exportSubtitle", { version }),
        columns,
        status,
      };
    },
    [t, tSchedule, locale],
  );
}
