"use client";

/**
 * 「已移出项目」 beside a task's 负责人 (JB245, 客户 11-23 事项 17).
 *
 * 「人员一旦被撤除项目权限，必须立即停止该项目的所有操作权限」: a person taken off
 * the project can no longer open or do the tasks they had there. The task and
 * its history stay (the server says ``assignee_left_project``); the office
 * sees why nothing moves and gives it to somebody on the project now (编辑).
 */

import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/page-primitives";

export function AssigneeName({ name, left }: { name: string; left?: boolean }) {
  const t = useTranslations("jb245");
  if (!left) return <>{name}</>;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5" data-assignee-left="true">
      <span className="truncate">{name}</span>
      <StatusBadge label={t("leftProject")} tone="warning" />
    </span>
  );
}
