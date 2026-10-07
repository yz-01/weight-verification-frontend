"use client";

import { useQuery } from "@tanstack/react-query";
import { AlarmClock, ClipboardCheck, ListTodo, Megaphone, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { HeadquartersAnnouncements } from "@/components/dashboard/headquarters-announcements";
import { HeadquartersApprovals } from "@/components/dashboard/headquarters-approvals";
import { HeadquartersTasks } from "@/components/dashboard/headquarters-tasks";
import { LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import type { HeadquartersOverview } from "@/interfaces/headquarters";
import { cardHref } from "@/lib/headquarters-links";
import { recordTarget } from "@/lib/record-routes";
import { getSafetyIncidents } from "@/services/site-operations.service";

export type WorkTab = "approvals" | "tasks" | "announcements" | "overdue";

export const WORK_TABS: readonly WorkTab[] = ["approvals", "tasks", "announcements", "overdue"];

/**
 * 总部工作 on the company page (C16-C19): what waits on a decision across
 * every project, the tasks head office has set, its announcements, and the
 * rectifications past their deadline - each row opening the item itself.
 */
export function HeadquartersWork({
  initialTab = "approvals",
  approvalsProject = "",
}: {
  /** From `?work=` - a card elsewhere opened this tab (F8, B8). */
  initialTab?: WorkTab;
  /** From `?work_project=` - the 集中审批 list narrowed to one project. */
  approvalsProject?: string;
}) {
  const t = useTranslations("headquarters.work");
  const [tab, setTab] = useState<WorkTab>(initialTab);
  // A card's link ends in `#headquarters-work`, but this section only exists
  // once the page's numbers have loaded - after the browser looked for it.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === "#headquarters-work") {
      section.current?.scrollIntoView({ block: "start" });
    }
  }, []);
  const tabs: Array<{ key: WorkTab; label: string; icon: typeof ClipboardCheck }> = [
    { key: "approvals", label: t("tabApprovals"), icon: ClipboardCheck },
    { key: "tasks", label: t("tabTasks"), icon: ListTodo },
    { key: "announcements", label: t("tabAnnouncements"), icon: Megaphone },
    { key: "overdue", label: t("tabOverdue"), icon: AlarmClock },
  ];
  return (
    <section
      ref={section}
      id="headquarters-work"
      aria-label={t("title")}
      className="scroll-mt-4 space-y-3 surface-panel rounded-xl p-4"
      data-headquarters-work
    >
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 border-b border-panel-border pb-2">
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
        <HeadquartersApprovals initialProject={approvalsProject} />
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

/** Whole days past `due`, as the hazard list counts lateness. */
function daysOverdue(due: string | null): number {
  if (!due) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / 86_400_000));
}

/**
 * Rectifications past their deadline, each opening the hazard.
 *
 * Read from the hazard list's own `overdue=1` - the definition the head-office
 * figure is counted with - rather than the project dashboard's old 「待处理异常」
 * card, which C15 turned into the reader's own open items.
 */
function OverdueRectifications() {
  const t = useTranslations("headquarters.work");
  const format = useFormatter();
  const work = useQuery({
    queryKey: ["safety", "headquarters-overdue"],
    queryFn: () =>
      getSafetyIncidents({
        overdue: "1",
        page_size: 20,
        sort_by: "rectification_due_at",
        sort_order: "asc",
      }),
    refetchInterval: 60_000,
  });
  const overdue = work.data;
  if (work.isError) return <LoadFailed onRetry={() => void work.refetch()} />;
  if (!overdue) return <Skeleton className="h-32 w-full" />;
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {t("overdue", { count: format.number(overdue.count) })}
      </p>
      {overdue.results.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{t("noOverdue")}</p>
      ) : (
        <ul className="divide-y">
          {overdue.results.map((row) => {
            const target = recordTarget("SAFETY_INCIDENT", row.id);
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <Link
                    href={target && "href" in target ? target.href : "/hazard-rectifications?overdue=1"}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {row.incident_no} · {row.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{row.project_name}</p>
                </div>
                <StatusBadge
                  label={t("daysOverdue", { days: daysOverdue(row.rectification_due_at) })}
                  tone="danger"
                />
              </li>
            );
          })}
        </ul>
      )}
      {overdue.count > overdue.results.length && (
        <Link
          href="/hazard-rectifications?overdue=1"
          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
        >
          {t("allOverdue", { count: overdue.count })}
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
      className="space-y-2 surface-panel rounded-xl p-4"
      data-headquarters-presence
    >
      <h2 className="flex items-center justify-between gap-2 border-b border-panel-border pb-2 text-sm font-semibold">
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
                href={cardHref("on_site_now", { project: row.id, date: data.date }) ?? "/attendance"}
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
