"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  Bell,
  BellPlus,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  HardHat,
  Inbox,
  KeyRound,
  ListTodo,
  LogOut,
  MapPinOff,
  PackageCheck,
  PackageMinus,
  Plus,
  Recycle,
  Search,
  ShieldAlert,
  Trash2,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { PhotoThumb, recordPhotos } from "@/components/shared/photo-thumb";
import { ContractorLocationMap } from "@/components/dashboard/contractor-location-map";
import { DashboardCards } from "@/components/dashboard/dashboard-cards";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { useAuth } from "@/components/providers/auth-provider";
import {
  type OpenedRecordHeading,
  useRecordOpener,
} from "@/components/shared/record-opener";
import { opensInPlace } from "@/components/shared/in-place-record";
import {
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Timeline } from "@/components/shared/timeline";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useProjectBoxShown } from "@/components/providers/current-project-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ContractorDashboardSection,
  DashboardOverview,
  ProjectStatusKey,
  TimelineEntry,
} from "@/interfaces/contractor-dashboard";
import { activityHref } from "@/lib/activity-href";
import {
  expiringPassesHref,
  geofenceBreachesHref,
  timelineTarget,
  timelineTone,
} from "@/lib/timeline-targets";
import { useDateFormat } from "@/lib/dates";
import {
  exportContractorDashboard,
  getContractorDashboard,
  searchContractorDashboard,
} from "@/services/contractor-dashboard.service";

/**
 * How often the volatile sections are re-fetched (CTR-1.2.13).
 *
 * Only `activity`, `rectifications` and `notifications` are polled. The rest change
 * on a human timescale, so refreshing them every 30s would cost eight section
 * groups of queries to redraw numbers that had not moved.
 */
const REFRESH_MS = 30_000;
const LIVE_SECTIONS: ContractorDashboardSection[] = [
  "activity",
  "rectifications",
  "notifications",
  // The unread pile moves while the page is open - this reader opens a
  // delivery in another tab and the number here has to follow, or the home
  // page keeps advertising work that is already done.
  "unread",
];

const PROJECT_STATUSES: ProjectStatusKey[] = [
  "PLANNING",
  "ACTIVE",
  "SUSPENDED",
  "COMPLETED",
];

/** Where each feed row's module lives, for the deep link on a row. */
const EXPORT_COLUMNS = [
  "occurred_at",
  "kind",
  "project",
  "reference",
  "summary",
  "status",
] as const;

/** The small type icon on each timeline row (E2). */
const TIMELINE_ICONS: Record<string, LucideIcon> = {
  MATERIAL_OUTGOING: PackageMinus,
  EQUIPMENT_MOVEMENT: Truck,
  SITE_PROGRESS: ClipboardCheck,
  DISPOSAL: Trash2,
  WASTE_DISPATCH: Recycle,
  SAFETY_INCIDENT: ShieldAlert,
  CONSULTANT_APPLICATION: FileText,
  FIELD_TASK: ListTodo,
  GEOFENCE_FAILURE: MapPinOff,
  OVERDUE_RECTIFICATION: AlarmClock,
  MATERIAL_RECEIPT: PackageCheck,
};

/**
 * A record status in words, or the code when nothing covers it.
 *
 * The activity feed and the search results draw on eight models, so the
 * badge meets statuses from all of them. The customer photographed
 * `PENDING_APPROVAL` sitting in that badge (F-225).
 *
 * The fallback is the code itself, deliberately. Printing
 * `contractorDashboard.recordStatus.FOO` at the reader would be worse than
 * printing `FOO`, and a code on screen is a visible prompt to add the entry.
 */
function useRecordStatus(): (status: string) => string {
  const t = useTranslations("contractorDashboard");
  return (status: string) => {
    const key = `recordStatus.${status}`;
    return t.has(key) ? t(key) : status;
  };
}

/**
 * The 项目 Dashboard (C11): one project's day - or every project's, when none
 * is chosen. The project is the page's, read from and written to its URL, so a
 * link from the 公司总部 Dashboard lands on the project it names.
 */
export function ContractorDashboard({
  project,
  onProjectChange: setProject,
}: {
  project: string;
  onProjectChange: (project: string) => void;
}) {
  const recordStatus = useRecordStatus();
  const t = useTranslations("contractorDashboard");
  const map = useTranslations("contractorDashboard.locationMap");
  const opener = useRecordOpener();
  const format = useFormatter();
  const df = useDateFormat();
  const { can } = useAuth();
  const projectBoxShown = useProjectBoxShown("filter");

  // The full payload. Not polled: the slow sections live here.
  const full = useQuery({
    queryKey: ["contractor-dashboard", project],
    queryFn: () => getContractorDashboard({ project: project || undefined }),
  });
  // The volatile sections, polled on their own. Same endpoint, narrowed with
  // `?sections=`, so a tick costs three section groups instead of eight.
  const live = useQuery({
    queryKey: ["contractor-dashboard", "live", project],
    queryFn: () =>
      getContractorDashboard({
        project: project || undefined,
        sections: LIVE_SECTIONS,
      }),
    refetchInterval: REFRESH_MS,
  });
  const data = full.data;
  // Prefer the polled copy where it exists so the feed is never staler than
  // the numbers beside it.
  const activity = live.data?.activity ?? data?.activity;
  const rectifications = live.data?.rectifications ?? data?.rectifications;
  const notifications = live.data?.notifications ?? data?.notifications;
  const unread = live.data?.unread ?? data?.unread;

  /*
   * B8 / F6 (Q6, Q20): the first screen is six small cards - 等你处理,
   * 待审批事项, 待处理整改 / EHS, 今日材料到场, 今日进出打卡, 安全事件 - and what
   * a card holds pops up when it is pointed at. The three big lists that sat
   * here (等你处理 / 待审批事项 / 待处理异常) are gone: 「全部收进上面的小卡，
   * 鼠标指着小卡时才跑出来，整个页面空间就多了」.
   */
  const priorityGrid = data ? (
    <section aria-label={t("priority.title")} data-dashboard-priority>
      <DashboardCards
        data={data}
        unread={unread}
        rectifications={rectifications}
        project={project}
      />
    </section>
  ) : null;

  if (full.isError) {
    return (
      <div className="border-y py-12 text-center text-sm text-muted-foreground">
        {t("error")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {live.isError && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          {t("liveStopped")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The top bar's 「当前项目」 is this choice when it is in force (B13). */}
        {projectBoxShown ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("filter.project")}
          </span>
          <ProjectPicker
            value={project || "all"}
            onValueChange={(next) => setProject(next === "all" ? "" : next)}
            placeholder={t("filter.selectProject")}
            allowAll
            allLabel={t("filter.allProjects")}
            className="w-full sm:w-72"
          />
        </div>
        ) : <span />}
        <div className="flex flex-wrap items-center gap-2">
          {data?.generated_at && (
            <span className="text-xs text-muted-foreground">
              {t("refreshedAt", { at: df.dateTime(data.generated_at) })}
            </span>
          )}
          {can("dashboard.export") && <ExportButtons project={project} />}
        </div>
      </div>

      {/*
        Pending work above the controls (T-215): the six cards first, then
        everything else as sections that open on a click (F7).
      */}
      {priorityGrid}
      {opener.sheet}

      {can("dashboard.search") && <QuickSearch project={project} />}

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/*
            F7 (Q21): every section below the cards opens and closes on its
            title, starts closed and stays the way this viewer left it. A
            number already on one of the six cards is not repeated in here -
            today's deliveries, clock events and safety incidents (and the
            safety block's 今日巡检, the same count) are on the cards.
          */}
          {data.overview && (
            <div className="space-y-3" data-dashboard-overview>
              <DashboardSection id="overview" title={t("overview.title")}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  <Metric
                    label={t("overview.projects")}
                    value={data.overview.projects.total}
                    icon={HardHat}
                    href="/projects"
                  />
                  <Metric
                    label={t("overview.progressRecords")}
                    value={data.overview.today.progress_records}
                    icon={ClipboardCheck}
                    href="/progress"
                  />
                  <Metric
                    label={t("overview.materialReturns")}
                    value={data.overview.today.material_returns}
                    icon={Undo2}
                    href="/receipts"
                    tone={
                      data.overview.today.material_returns > 0 ? "warning" : undefined
                    }
                  />
                  <Metric
                    label={t("overview.equipmentIn")}
                    value={data.overview.today.equipment_entries}
                    icon={Truck}
                    href="/site-equipment"
                  />
                  <Metric
                    label={t("overview.equipmentOut")}
                    value={data.overview.today.equipment_exits}
                    icon={LogOut}
                    href="/site-equipment"
                  />
                  <Metric
                    label={t("overview.materialPendingAcceptance")}
                    value={data.overview.today.material_pending_acceptance}
                    icon={ClipboardList}
                    href="/receipts"
                    tone={
                      data.overview.today.material_pending_acceptance > 0
                        ? "warning"
                        : undefined
                    }
                  />
                  <Metric
                    label={t("overview.equipmentExpiring")}
                    value={data.overview.today.equipment_expiring}
                    icon={CalendarClock}
                    href="/site-equipment?expiring=1"
                    tone={
                      data.overview.today.equipment_expiring > 0
                        ? "warning"
                        : undefined
                    }
                  />
                  {/* Off the old 「待处理异常」 card (C15), which is now
                      rectification / EHS only. Each opens its own list,
                      filtered the way the number was counted. */}
                  <Metric
                    label={t("overview.geofenceFailures", {
                      days: data.overview.today.geofence_window_days,
                    })}
                    value={data.overview.today.geofence_failures}
                    icon={MapPinOff}
                    href={geofenceBreachesHref({
                      from: data.overview.today.geofence_since,
                      project: project || undefined,
                    })}
                    tone={
                      data.overview.today.geofence_failures > 0
                        ? "warning"
                        : undefined
                    }
                  />
                  <Metric
                    label={t("overview.expiringPasses")}
                    value={data.overview.today.expiring_permits}
                    icon={KeyRound}
                    href={expiringPassesHref(project || undefined)}
                    tone={
                      data.overview.today.expiring_permits > 0
                        ? "warning"
                        : undefined
                    }
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PROJECT_STATUSES.map((status) => (
                    <span
                      key={status}
                      className="rounded-full border bg-card px-3 py-1 text-xs font-medium"
                    >
                      {t(`projectStatus.${status}`)}{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {format.number(data.overview?.projects.by_status[status] ?? 0)}
                      </span>
                    </span>
                  ))}
                </div>
              </DashboardSection>

              <DashboardSection
                id="safety"
                title={t("safetySummary.title")}
                subtitle={t("safetySummary.subtitle")}
                action={
                  <Link href="/hazard-rectifications" className="text-xs font-semibold text-primary hover:underline">
                    {t("safetySummary.open")}
                  </Link>
                }
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {/* 逾期 is red on the home page and nowhere else - U-029 was
                      decided as 「只在首页红一下」, no escalation. But red has to
                      lead somewhere: `overdue=1` on the list applies the same
                      definition this figure is counted with. 今日巡检 is not
                      here any more: it is the 安全事件 card's number (F7). */}
                  {(["pending_rectification", "in_progress", "overdue", "completed"] as const).map((key) => {
                    const value = data.overview?.safety[key] ?? 0;
                    const isLate = key === "overdue" && value > 0;
                    const tile = (
                      <div
                        className={`rounded-lg p-3 ${isLate ? "bg-destructive/10 ring-1 ring-destructive/30" : "bg-muted/40"}`}
                      >
                        <p className="text-xs text-muted-foreground">{t(`safetySummary.${key}`)}</p>
                        <p className={`mt-1 text-xl font-semibold tabular-nums ${isLate ? "text-destructive" : ""}`}>
                          {format.number(value)}
                        </p>
                      </div>
                    );
                    return isLate ? (
                      <Link key={key} href={withProject("/hazard-rectifications?overdue=1", project)} className="block transition-transform hover:scale-[1.02]">
                        {tile}
                      </Link>
                    ) : (
                      <div key={key}>{tile}</div>
                    );
                  })}
                </div>
                {!!data.overview.safety.recent_notes.length && (
                  <div className="mt-3 divide-y border-t">
                    {data.overview.safety.recent_notes.map((row) => (
                      <Link key={row.id} href={`/hazard-rectifications?incident=${row.id}`} className="block py-2 text-sm hover:bg-muted/30">
                        <span className="font-medium">{row.incident_no} · {row.title}</span>
                        <span className="ml-2 text-muted-foreground">{row.note}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </DashboardSection>

              <DashboardSection
                id="schedule"
                title={t("scheduleSummary.title")}
                subtitle={t("scheduleSummary.subtitle")}
                action={
                  <Link href="/schedule" className="text-xs font-semibold text-primary hover:underline">
                    {t("scheduleSummary.open")}
                  </Link>
                }
              >
                <ScheduleSummary schedule={data.overview.schedule} />
              </DashboardSection>
            </div>
          )}

          {can("field_position.view") && (
            <DashboardSection id="map" title={map("title")}>
              <ContractorLocationMap
                project={project}
                onProjectChange={setProject}
                headless
              />
            </DashboardSection>
          )}

          {activity && (
            <DashboardSection
              id="activity"
              title={t("activity.title")}
              subtitle={t("activity.subtitle", { count: activity.total })}
            >
              {activity.rows.length === 0 ? (
                <Empty label={t("activity.empty")} />
              ) : (
                <ul className="max-h-96 divide-y overflow-y-auto">
                  {activity.rows.map((row, index) => (
                    <li
                      key={`${row.kind}-${row.reference}-${index}`}
                      className="flex items-start justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        {row.id && opensInPlace(row.kind) ? (
                          // Opens over the dashboard, which stays (2026-10-10).
                          <button
                            type="button"
                            onClick={() =>
                              opener.open(row.kind, row.id, {
                                reference: row.reference,
                                project_id: null,
                                project_name: row.project,
                                submitted_at: row.occurred_at,
                              })
                            }
                            className="text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t(`activityKind.${row.kind}`)} · {row.reference}
                          </button>
                        ) : (
                          <Link
                            href={activityHref(row)}
                            className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t(`activityKind.${row.kind}`)} · {row.reference}
                          </Link>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          {row.project} · {row.summary}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge label={recordStatus(row.status)} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {df.dateTime(row.occurred_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardSection>
          )}

          {data.personnel && (
            <DashboardSection
              id="personnel"
              title={t("personnel.title")}
              subtitle={t("personnel.subtitle", {
                workers: data.personnel.unique_workers,
              })}
            >
              {data.personnel.unique_workers === 0 ? (
                <Empty label={t("personnel.empty")} />
              ) : (
                <>
                  {/* Four numbers where there was one total (T-184). "On site
                      now" is the one a site manager actually wants, and it is
                      not derivable from the other three. */}
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <PersonnelFigure
                      label={t("personnel.onSiteNow")}
                      value={data.personnel.on_site_now}
                    />
                    <PersonnelFigure
                      label={t("personnel.entered")}
                      value={data.personnel.entered}
                    />
                    <PersonnelFigure
                      label={t("personnel.left")}
                      value={data.personnel.left}
                    />
                    <PersonnelFigure
                      label={t("personnel.irregular")}
                      value={data.personnel.irregular}
                      tone={data.personnel.irregular > 0 ? "warning" : undefined}
                    />
                  </div>
                  {data.personnel.irregular > 0 && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {t("personnel.irregularBreakdown", {
                        outside: data.personnel.irregular_breakdown.outside_geofence,
                        order: data.personnel.irregular_breakdown.out_of_order,
                        noExit: data.personnel.irregular_breakdown.without_exit,
                      })}
                    </p>
                  )}
                  {/* Per project only with two or more: one line would be the
                      今日进出打卡 card's number again (F7, Q21), and the server
                      sends none then. */}
                  {data.personnel.by_project.length > 1 && (
                    <ul className="divide-y">
                      {data.personnel.by_project.map((row) => (
                        <li
                          key={row.project}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="truncate text-sm">{row.project}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {format.number(row.events)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </DashboardSection>
          )}

          {notifications && (
            <DashboardSection
              id="notifications"
              title={t("notifications.title")}
              subtitle={t("notifications.subtitle", {
                today: notifications.today,
                earlier: notifications.earlier,
              })}
              action={
                <Link
                  href="/notifications"
                  className="text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t("notifications.openAll")}
                </Link>
              }
            >
              {/* The endpoint reports scope RECIPIENT: Notification has no
                  project FK, so this list cannot narrow with the filter. */}
              <p className="mb-2 text-xs text-muted-foreground">
                {t("notifications.recipientScope")}
              </p>
              {notifications.rows.length === 0 ? (
                <Empty label={t("notifications.empty")} />
              ) : (
                <ul className="max-h-96 divide-y overflow-y-auto">
                  {notifications.rows.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                      {/* The photograph of the record the notice is about (E3),
                          opening that record's photographs (audit #4). A
                          notice about no record has a picture only. */}
                      <PhotoThumb
                        coverUrl={row.cover_photo_url}
                        count={row.photo_count}
                        icon={Bell}
                        reference={row.title}
                        size="sm"
                        photos={
                          row.subject_kind && row.subject_id
                            ? recordPhotos(row.subject_kind, row.subject_id, row.title)
                            : undefined
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.message}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {row.state === "PENDING" && (
                          <StatusBadge
                            label={t("notifications.outstanding")}
                            tone="info"
                          />
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {df.relative(row.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardSection>
          )}

          {data.timeline && (
            <DashboardSection
              id="timeline"
              title={t("timeline.title")}
              subtitle={t("timeline.subtitle", { count: data.timeline.total })}
            >
              {data.timeline.entries.length === 0 ? (
                <Empty label={t("timeline.empty")} />
              ) : (
                <div className="max-h-[32rem] overflow-y-auto">
                  <DashboardTimeline
                    entries={data.timeline.entries}
                    onOpen={opener.open}
                  />
                </div>
              )}
            </DashboardSection>
          )}

          <DashboardSection id="quick-actions" title={t("quickActions.title")}>
            <QuickActions project={project} />
          </DashboardSection>
        </>
      )}
    </div>
  );
}

/** `href` narrowed to the dashboard's project, when it reads one. */
function withProject(href: string, project: string): string {
  if (!project) return href;
  return `${href}${href.includes("?") ? "&" : "?"}project=${encodeURIComponent(project)}`;
}

function Empty({ label }: { label: string }) {
  return <p className="py-3 text-center text-sm text-muted-foreground">{label}</p>;
}

function QuickActions({ project }: { project: string }) {
  const t = useTranslations("contractorDashboard.quickActions");
  const actions: Array<{
    href: string;
    label: string;
    icon: typeof Inbox;
    requiresProject?: boolean;
  }> = [
    { href: "/projects/create", label: t("project"), icon: Plus },
    { href: "/suppliers/create", label: t("supplier"), icon: Inbox },
    {
      // Opens the create dialog on Category Management in place (D-264).
      href: `/category-management?project=${encodeURIComponent(project)}&module=material&create=1`,
      label: t("category"),
      icon: FolderPlus,
      requiresProject: true,
    },
    { href: "/documents?create=1", label: t("document"), icon: FilePlus2 },
    // No 「新建审批」 here (A05): approval happens inside the item it is
    // about, and the standalone flow is an advanced page under Documents.
    { href: "/notifications?create=1", label: t("notification"), icon: BellPlus },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {actions.map((action) => {
        const Icon = action.icon;
        if (action.requiresProject && !project) {
          return (
            <Button
              key={action.href}
              disabled
              variant="outline"
              className="shrink-0"
              title={t("selectProjectFirst")}
            >
              <Icon />
              {action.label}
            </Button>
          );
        }
        return (
          <Button key={action.href} asChild variant="outline" className="shrink-0">
            <Link href={action.href}><Icon />{action.label}</Link>
          </Button>
        );
      })}
    </div>
  );
}

function ScheduleSummary({ schedule }: { schedule: DashboardOverview["schedule"] }) {
  const t = useTranslations("contractorDashboard.scheduleSummary");
  const format = useFormatter();
  const planned = Math.max(0, Math.min(100, Number(schedule.planned_progress) || 0));
  const actual = Math.max(0, Math.min(100, Number(schedule.actual_progress) || 0));
  const metrics = [
    ["activePlans", schedule.active_plans],
    ["tasks", schedule.tasks],
    ["delayed", schedule.delayed_tasks],
    ["dueNext7Days", schedule.due_next_7_days],
    ["completed", schedule.completed_tasks],
  ] as const;
  // Actual minus planned, from the server rather than subtracted here: two
  // screens doing their own subtraction is how the rollup came to disagree
  // with itself (F-226).
  const variance = Number(schedule.variance ?? 0);

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {([
            ["planned", planned, "bg-foreground/55"],
            ["actual", actual, "bg-primary"],
          ] as const).map(([label, value, colour]) => (
            <div key={label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-muted-foreground">{t(label)}</span>
                <span className="font-semibold tabular-nums">
                  {t("progress", { value: format.number(value, { maximumFractionDigits: 1 }) })}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${colour}`} style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{t("variance")}</p>
            <p
              className={
                "mt-1 text-xl font-semibold tabular-nums " +
                (variance < 0
                  ? "text-destructive"
                  : variance > 0
                    ? "text-success"
                    : "")
              }
            >
              {variance === 0
                ? t("onPlan")
                : variance < 0
                  ? t("behind", {
                      value: format.number(Math.abs(variance), {
                        maximumFractionDigits: 1,
                      }),
                    })
                  : t("ahead", {
                      value: format.number(variance, {
                        maximumFractionDigits: 1,
                      }),
                    })}
            </p>
          </div>
          {/* What the two percentages above were calculated from. Without it
              a 25% drawn from forty weighted tasks looks the same as a 25%
              drawn from the one task somebody typed a number into. */}
          <p className="text-xs text-muted-foreground">
            {t("countedFrom", {
              counted: schedule.counted_tasks ?? 0,
              weight: schedule.total_weight ?? "0",
            })}
            {(schedule.summary_rows_excluded ?? 0) > 0 && (
              <>
                {" · "}
                {t("summaryExcluded", {
                  count: schedule.summary_rows_excluded ?? 0,
                })}
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
          {metrics.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{t(label)}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{format.number(value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The dashboard timeline (E2): the shared `Timeline`, a type icon per row, the
 * dot in the colour of the row's badge, and the whole row opening its record
 * through the shared record route.
 */
function DashboardTimeline({
  entries,
  onOpen,
}: {
  entries: TimelineEntry[];
  onOpen: (kind: string, id: string, heading: OpenedRecordHeading) => boolean;
}) {
  const t = useTranslations("contractorDashboard");
  const df = useDateFormat();
  return (
    <Timeline
      label={t("timeline.title")}
      items={entries.map((entry, index) => {
        const target = timelineTarget(entry);
        const tone = timelineTone(entry.severity);
        const id = entry.id;
        return {
          key: `${entry.kind}-${id ?? index}`,
          title: entry.label,
          meta: entry.project || undefined,
          at: df.dateTime(entry.at),
          tone,
          badge: (
            <StatusBadge
              label={
                t.has(`timelineKind.${entry.kind}`)
                  ? t(`timelineKind.${entry.kind}`)
                  : entry.kind
              }
              tone={tone}
            />
          ),
          icon: TIMELINE_ICONS[entry.kind],
          thumbnail: entry.cover_photo_url,
          // A record whose module popup stands on its own opens over the
          // dashboard (Lucas 2026-10-10: 「不会跳转」), as a sheet does.
          href:
            target && "href" in target && !(id && opensInPlace(entry.kind))
              ? target.href
              : undefined,
          onOpen:
            target && id && ("sheet" in target || opensInPlace(entry.kind))
              ? () => {
                  onOpen(entry.kind, id, {
                    reference: entry.label,
                    project_id: null,
                    project_name: entry.project,
                    submitted_at: entry.at,
                  });
                }
              : undefined,
        };
      })}
    />
  );
}

function QuickSearch({ project }: { project: string }) {
  const t = useTranslations("contractorDashboard");
  const recordStatus = useRecordStatus();
  const common = useTranslations("common");
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  const results = useQuery({
    queryKey: ["contractor-dashboard", "search", submitted, project],
    queryFn: () =>
      searchContractorDashboard({
        search: submitted,
        project: project || undefined,
      }),
    // The endpoint refuses a term under two characters, so do not send one.
    enabled: submitted.trim().length >= 2,
  });

  return (
    <section aria-label={t("search.title")} className="space-y-2">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(term.trim());
        }}
      >
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.title")}
          className="w-full sm:max-w-sm"
        />
        <Button
          type="submit"
          variant="outline"
          disabledReason={
            term.trim().length < 2
              ? common("searchMinLength", { count: 2 })
              : undefined
          }
          disabled={term.trim().length < 2}
        >
          <Search />
          {t("search.action")}
        </Button>
        {submitted && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setTerm("");
              setSubmitted("");
            }}
          >
            {t("search.clear")}
          </Button>
        )}
      </form>
      {submitted.trim().length >= 2 && (
        <div className="surface-panel rounded-xl p-4">
          {results.isError ? (
            <LoadFailed onRetry={() => void results.refetch()} />
          ) : results.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : results.data?.rows.length ? (
            <ul className="divide-y">
              {results.data.rows.map((row) => (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-medium">{t(`activityKind.${row.kind}`)}</span>{" "}
                    · {row.reference}
                    {row.project && (
                      <span className="text-muted-foreground"> · {row.project}</span>
                    )}
                  </span>
                  {row.status && (
                    <StatusBadge label={recordStatus(row.status)} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              {t("search.noResults", { term: submitted })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ExportButtons({ project }: { project: string }) {
  const t = useTranslations("contractorDashboard");
  const [busy, setBusy] = useState<"PDF" | "EXCEL" | null>(null);

  const run = async (format: "PDF" | "EXCEL") => {
    setBusy(format);
    try {
      await exportContractorDashboard({
        format,
        project: project || undefined,
        title: t("export.title"),
        subtitle: t("export.subtitle"),
        // The server writes whatever labels it is handed, so the wording stays
        // in the message catalogue rather than being duplicated in Python.
        column_labels: Object.fromEntries(
          EXPORT_COLUMNS.map((key) => [key, t(`export.column.${key}`)]),
        ),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => void run("EXCEL")}
      >
        <FileSpreadsheet />
        {t("export.excel")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => void run("PDF")}
      >
        <Download />
        {t("export.pdf")}
      </Button>
    </div>
  );
}

/**
 * How long a pending approval has been waiting, in the largest unit that
 * still says something useful.
 *
 * Takes the server's number of seconds rather than recomputing from the
 * timestamp: the point of measuring it there was that two devices with
 * different clocks must not give two answers (T-185).
 */
export function WaitingFor({ seconds }: { seconds: number }) {
  const t = useTranslations("contractorDashboard");
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) {
    return <>{t("approvals.waitingMinutes", { count: minutes })}</>;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return <>{t("approvals.waitingHours", { count: hours })}</>;
  }
  return <>{t("approvals.waitingDays", { count: Math.floor(hours / 24) })}</>;
}

function PersonnelFigure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning";
}) {
  const format = useFormatter();
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        tone === "warning" ? "border-tone-amber/40 bg-tone-amber/8" : "border-panel-border bg-muted/40"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`kpi-figure mt-1 text-xl ${tone === "warning" ? "text-tone-amber-fg" : "text-foreground"}`}>
        {format.number(value)}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  href,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  href: string;
  tone?: "warning";
}) {
  const format = useFormatter();
  return (
    <Link
      href={href}
      className={`rounded-xl border px-4 py-3 transition hover:-translate-y-px hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        tone === "warning" ? "border-tone-amber/40 bg-tone-amber/8" : "border-tone-cyan/35 bg-tone-cyan/8"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={`size-4 shrink-0 ${tone === "warning" ? "text-tone-amber-fg" : "text-tone-cyan-fg"}`} />
      </div>
      <p className={`kpi-figure mt-1 text-2xl ${tone === "warning" ? "text-tone-amber-fg" : "text-tone-cyan-fg"}`}>
        {format.number(value)}
      </p>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}
