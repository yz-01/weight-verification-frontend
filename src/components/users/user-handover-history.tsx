"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowRightLeft,
  BriefcaseBusiness,
  ListChecks,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ListHeader } from "@/components/shared/page-primitives";
import { getUserReplacements } from "@/services/users.service";

export function UserHandoverHistory() {
  const t = useTranslations("userHandover");
  const rows = useQuery({
    queryKey: ["users", "handovers"],
    queryFn: () => getUserReplacements({ page_size: 200 }),
  });
  return (
    <div className="space-y-5 pb-10">
      <ListHeader
        title={t("history.title")}
        subtitle={t("history.subtitle", { count: rows.data?.count ?? 0 })}
      />
      {rows.isLoading && (
        <div className="grid min-h-48 place-items-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      )}
      {rows.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t("state.loadError")}
        </p>
      )}
      {!rows.isLoading && !rows.isError && !rows.data?.count && (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          {t("state.empty")}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {(rows.data?.results ?? []).map((row) => {
          const projects = row.transfer_summary.project_ids?.length ?? 0;
          const tasks = row.transfer_summary.task_ids?.length ?? 0;
          return (
            <article
              key={row.id}
              className="rounded-xl border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ArrowRightLeft />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.completed_at).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 font-semibold">
                    <span>{row.outgoing_user_name}</span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                    <span>{row.incoming_user_name}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.outgoing_user_email} → {row.incoming_user_email}
                  </p>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-muted/35 px-3 py-2 text-sm">
                {row.reason}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <BriefcaseBusiness className="size-4 text-primary" />
                  {t("history.projects", { count: projects })}
                </div>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <ListChecks className="size-4 text-primary" />
                  {t("history.tasks", { count: tasks })}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("history.completedBy", {
                  name: row.completed_by_name ?? "-",
                })}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
