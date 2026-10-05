"use client";

import { useQuery } from "@tanstack/react-query";
import { AlarmClock, ClipboardCheck, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { approvalHref } from "@/components/dashboard/contractor-dashboard";
import { LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import type { HeadquartersOverview } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { drillHref } from "@/lib/headquarters-links";
import { getContractorDashboard } from "@/services/contractor-dashboard.service";

/**
 * 审批和逾期 on the company page (C19): what is waiting on a decision across
 * every project, newest first, and the rectifications past their deadline -
 * each row opening the item itself. Read from the same queues the 项目
 * Dashboard shows, with no project filter.
 */
export function HeadquartersWork() {
  const t = useTranslations("headquarters.work");
  const sources = useTranslations("contractorDashboard.approvals.source");
  const df = useDateFormat();
  const format = useFormatter();
  const work = useQuery({
    queryKey: ["contractor-dashboard", "headquarters-work"],
    queryFn: () => getContractorDashboard({ sections: ["approvals", "anomalies"] }),
    refetchInterval: 60_000,
  });
  const approvals = work.data?.approvals;
  const overdue = work.data?.anomalies;

  return (
    <section
      aria-label={t("title")}
      className="space-y-3 rounded-lg border bg-card p-3 shadow-sm"
      data-headquarters-work
    >
      {work.isError ? (
        <LoadFailed onRetry={() => void work.refetch()} />
      ) : !approvals || !overdue ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div>
            <h2 className="flex items-center gap-2 border-b pb-1.5 text-sm font-semibold">
              <ClipboardCheck className="size-4 text-primary" aria-hidden />
              {t("approvals", { count: format.number(approvals.total) })}
            </h2>
            {approvals.rows.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">{t("noApprovals")}</p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto">
                {approvals.rows.map((row) => (
                  <li key={`${row.source}-${row.id}`} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <Link
                        href={approvalHref(row)}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {row.approval_no ? `${row.approval_no} · ${row.title}` : row.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          sources.has(row.source) ? sources(row.source) : row.resource_type,
                          row.project || t("companyWide"),
                          row.requested_by,
                          df.dateTime(row.submitted_at || row.created_at),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {approvals.total > approvals.rows.length && (
              <p className="pt-1 text-xs text-muted-foreground">
                {t("moreApprovals", {
                  shown: approvals.rows.length,
                  total: approvals.total,
                })}
              </p>
            )}
          </div>
          <div>
            <h2 className="flex items-center gap-2 border-b pb-1.5 text-sm font-semibold">
              <AlarmClock className="size-4 text-destructive" aria-hidden />
              {t("overdue", { count: format.number(overdue.overdue_total) })}
            </h2>
            {overdue.overdue_rectifications.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">{t("noOverdue")}</p>
            ) : (
              <ul className="max-h-60 divide-y overflow-y-auto">
                {overdue.overdue_rectifications.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <Link
                        href={`/hazard-rectifications?incident=${row.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {row.incident_no} · {row.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{row.project}</p>
                    </div>
                    <StatusBadge
                      label={t("daysOverdue", { days: row.days_overdue })}
                      tone="danger"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * 在场人数 by project (C19), from the same numbers as the figure above it:
 * App 人员 + 门岗通行 per project, each opening that project's 紧急在场名单.
 */
export function HeadquartersPresence({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.work");
  const format = useFormatter();
  const rows = data.projects
    .filter((row) => row.on_site_now > 0)
    .sort((a, b) => b.on_site_now - a.on_site_now);
  const largest = rows[0]?.on_site_now ?? 0;
  return (
    <section
      aria-label={t("presence")}
      className="space-y-2 rounded-lg border bg-card p-3 shadow-sm"
      data-headquarters-presence
    >
      <h2 className="flex items-center justify-between gap-2 border-b pb-1.5 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <Users className="size-4 text-primary" aria-hidden />
          {t("presence")}
        </span>
        <span className="text-lg tabular-nums">{format.number(data.totals.on_site_now)}</span>
      </h2>
      <p className="text-xs text-muted-foreground">
        {t("presenceSplit", {
          app: format.number(data.totals.app_on_site),
          gate: format.number(data.totals.gate_on_site),
        })}
      </p>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{t("nobodyOnSite")}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={drillHref("on_site_now", row.id)}
                className="block rounded-md px-1 py-0.5 hover:bg-muted/40"
              >
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{row.name}</span>
                  <span className="font-semibold tabular-nums">{format.number(row.on_site_now)}</span>
                </span>
                <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${largest ? (row.on_site_now / largest) * 100 : 0}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
