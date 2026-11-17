"use client";

/**
 * 「归档后锁定记录」 project by project, on MSE's company page (JB214-3d).
 *
 * Lucas 11-16 (Q1 = A, 「按项目锁」; 「把它们真的做出来」): a project switched on
 * takes, after 确认归档, only blanks filled in - what was written cannot be
 * changed. A project switched off keeps Lucas's 10-30 rule: its archived
 * records are still changed from the office, with the 6-digit PIN and a
 * change log. The client, 11-05 事项 2: 「涉及正式业务记录完整性，不能让客户
 * 随意关闭」 - so only MSE turns it, here, and every turn asks first in plain
 * words what will happen (「要站在老人家的角度去思考」).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { ErrorBanner, Toggle } from "@/components/site-access/settings-fields";
import {
  getCompanyProjectArchiveLocks,
  setProjectArchiveLock,
  type ProjectArchiveLockRow,
} from "@/services/project-archive-lock.service";

export function ProjectArchiveLocks({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const t = useTranslations("companies.lockedSettings.projectLocks");
  const qc = useQueryClient();
  const queryKey = ["companies", "project-archive-locks", companyId];
  const projects = useQuery({ queryKey, queryFn: () => getCompanyProjectArchiveLocks(companyId) });
  const [asking, setAsking] = useState<{ row: ProjectArchiveLockRow; next: boolean } | null>(null);
  const change = useMutation({
    mutationFn: ({ row, next }: { row: ProjectArchiveLockRow; next: boolean }) => setProjectArchiveLock(row.id, next),
    onSuccess: (saved) => {
      setAsking(null);
      qc.setQueryData<ProjectArchiveLockRow[]>(queryKey, (rows) =>
        (rows ?? []).map((row) => (row.id === saved.id ? saved : row)),
      );
      void qc.invalidateQueries({ queryKey: ["projects", "detail", saved.id] });
    },
  });

  const rows = projects.data ?? [];
  return (
    <div className="space-y-2" data-testid="project-archive-locks">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      <QueryFailedNote query={projects} what={t("what")} />
      {change.isError && <ErrorBanner text={t("saveError")} />}
      {projects.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {projects.isSuccess && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((row) => (
            <Toggle
              key={row.id}
              label={row.name}
              description={`${row.code} · ${row.lock_after_archive ? t("on") : t("off")}`}
              checked={row.lock_after_archive}
              disabled={!canManage || change.isPending}
              onChange={(next) => setAsking({ row, next })}
            />
          ))}
        </div>
      )}
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
        title={
          asking === null
            ? ""
            : asking.next
              ? t("confirmOnTitle", { project: asking.row.name })
              : t("confirmOffTitle", { project: asking.row.name })
        }
        description={asking === null ? "" : asking.next ? t("confirmOnBody") : t("confirmOffBody")}
        confirmLabel={asking?.next ? t("confirmOn") : t("confirmOff")}
        confirmIcon={asking?.next ? Lock : LockOpen}
        variant="default"
        isPending={change.isPending}
        onConfirm={() => {
          if (asking) change.mutate(asking);
        }}
      />
    </div>
  );
}
