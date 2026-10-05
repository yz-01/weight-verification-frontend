"use client";

import { useQuery } from "@tanstack/react-query";
import { AlarmClock, ClipboardCheck, ListTodo, Megaphone, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { HeadquartersAnnouncements } from "@/components/dashboard/headquarters-announcements";
import { HeadquartersApprovals } from "@/components/dashboard/headquarters-approvals";
import { HeadquartersTasks } from "@/components/dashboard/headquarters-tasks";
import { LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import type { HeadquartersOverview } from "@/interfaces/headquarters";
import { drillHref } from "@/lib/headquarters-links";
import { getContractorDashboard } from "@/services/contractor-dashboard.service";

type WorkTab = "approvals" | "tasks" | "announcements" | "overdue";

/**
 * 总部工作 on the company page (C16-C19): what waits on a decision across
 * every project, the tasks head office has set, its announcements, and the
 * rectifications past their deadline - each row opening the item itself.
 */
export function HeadquartersWork() {
  const t = useTranslations("headquarters.work");
  const [tab, setTab] = useState<WorkTab>("approvals");
  const tabs: Array<{ key: WorkTab; label: string; icon: typeof ClipboardCheck }> = [
    { key: "approvals", label: t("tabApprovals"), icon: ClipboardCheck },
    { key: "tasks", label: t("tabTasks"), icon: ListTodo },
    { key: "announcements", label: t("tabAnnouncements"), icon: Megaphone },
    { key: "overdue", label: t("tabOverdue"), icon: AlarmClock },
  ];
  return (
    <section
      aria-label={t("title")}
      className="space-y-3 rounded-lg border bg-card p-3 shadow-sm"
      data-headquarters-work
    >
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 border-b pb-1.5">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium " +
              (tab === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      {tab === "approvals" ? (
        <HeadquartersApprovals />
      ) : tab === "tasks" ? (
        <HeadquartersTasks />
      ) : tab === "announcements" ? (
        <HeadquartersAnnouncements />
      ) : (
        <OverdueRectifications />
      )}
    </section>
  );
}

/** Rectifications past their deadline, each opening the hazard. */
function OverdueRectifications() {
  const t = useTranslations("headquarters.work");
  const format = useFormatter();
  const work = useQuery({
    queryKey: ["contractor-dashboard", "headquarters-overdue"],
    queryFn: () => getContractorDashboard({ sections: ["anomalies"] }),
    refetchInterval: 60_000,
  });
  const overdue = work.data?.anomalies;
  if (work.isError) return <LoadFailed onRetry={() => void work.refetch()} />;
  if (!overdue) return <Skeleton className="h-32 w-full" />;
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {t("overdue", { count: format.number(overdue.overdue_total) })}
      </p>
      {overdue.overdue_rectifications.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{t("noOverdue")}</p>
      ) : (
        <ul className="divide-y">
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
              <StatusBadge label={t("daysOverdue", { days: row.days_overdue })} tone="danger" />
            </li>
          ))}
        </ul>
      )}
      {overdue.overdue_total > overdue.overdue_rectifications.length && (
        <Link
          href="/hazard-rectifications?overdue=1"
          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
        >
          {t("allOverdue", { count: overdue.overdue_total })}
        </Link>
      )}
    </div>
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
