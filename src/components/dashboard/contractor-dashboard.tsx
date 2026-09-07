"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BellPlus,
  CalendarClock,
  CalendarRange,
  CalendarCheck,
  ClipboardList,
  Camera,
  ClipboardCheck,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FolderPlus,
  HardHat,
  Inbox,
  LogOut,
  MapPin,
  PackageCheck,
  Plus,
  Search,
  ShieldAlert,
  Truck,
  Undo2,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ContractorLocationMap } from "@/components/dashboard/contractor-location-map";
import { useAuth } from "@/components/providers/auth-provider";
import {
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ActivityRow,
  ApprovalRow,
  ContractorDashboardSection,
  DashboardAnomalies,
  DashboardOverview,
  ProjectStatusKey,
  TimelineEntry,
} from "@/interfaces/contractor-dashboard";
import { useDateFormat } from "@/lib/dates";
import {
  exportContractorDashboard,
  getContractorDashboard,
  searchContractorDashboard,
} from "@/services/contractor-dashboard.service";

/**
 * How often the volatile sections are re-fetched (CTR-1.2.13).
 *
 * Only `activity`, `anomalies` and `notifications` are polled. The rest change
 * on a human timescale, so refreshing them every 30s would cost eight section
 * groups of queries to redraw numbers that had not moved.
 */
const REFRESH_MS = 30_000;
const LIVE_SECTIONS: ContractorDashboardSection[] = [
  "activity",
  "anomalies",
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
const ACTIVITY_HREF: Record<ActivityRow["kind"], string> = {
  MATERIAL_OUTGOING: "/material-outgoing",
  EQUIPMENT_MOVEMENT: "/site-equipment",
  SITE_PROGRESS: "/progress",
  DISPOSAL: "/site-disposals",
  WASTE_DISPATCH: "/dispatches",
  SAFETY_INCIDENT: "/safety",
  CONSULTANT_APPLICATION: "/consultant-applications",
  FIELD_TASK: "/field-tasks",
};

const EXPORT_COLUMNS = [
  "occurred_at",
  "kind",
  "project",
  "reference",
  "summary",
  "status",
] as const;

function severityTone(severity: TimelineEntry["severity"]) {
  if (severity === "DANGER") return "danger" as const;
  if (severity === "WARNING") return "warning" as const;
  return "neutral" as const;
}

/**
 * Where the decision on one waiting row is actually taken.
 *
 * Every row used to link to `/approvals?approval=<id>` - the document
 * workflow centre, which is built entirely on `ApprovalInstance` and knows
 * nothing about the other five queues. Now that a disposal request appears
 * here, that link would have opened a page that could not show it: a listed
 * item leading nowhere, which is worse than the item being absent, because
 * absence at least does not waste the reader a click.
 *
 * These are list screens rather than detail routes - none of them takes a row
 * id in the URL today - so the link lands on the list that holds the row and
 * does not pretend to deep-link. Anything unrecognised falls back to the
 * approval centre, which is right for rows that really are workflow
 * approvals and harmless for anything new that has not been mapped yet.
 */
const APPROVAL_QUEUES: Record<string, string> = {
  DISPOSAL_REQUEST: "/site-disposals",
  WASTE_OUTGOING: "/waste-outgoing",
  FIELD_TASK: "/field-tasks",
  SITE_PROGRESS: "/progress",
  CONSULTANT_APPLICATION: "/consultant-applications",
};

function approvalHref(row: ApprovalRow): string {
  const own = APPROVAL_QUEUES[row.source];
  return own ?? `/approvals?approval=${row.id}`;
}

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

export function ContractorDashboard() {
  const recordStatus = useRecordStatus();
  const t = useTranslations("contractorDashboard");
  const format = useFormatter();
  const df = useDateFormat();
  const { can } = useAuth();
  const [project, setProject] = useState("");

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
  const anomalies = live.data?.anomalies ?? data?.anomalies;
  const notifications = live.data?.notifications ?? data?.notifications;
  const unread = live.data?.unread ?? data?.unread;

  if (full.isError) {
    return (
      <div className="border-y py-12 text-center text-sm text-muted-foreground">
        {t("error")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {live.isError && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          {t("liveStopped")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
          {data?.generated_at && (
            <span className="text-xs text-muted-foreground">
              {t("refreshedAt", { at: df.dateTime(data.generated_at) })}
            </span>
          )}
          {can("dashboard.export") && <ExportButtons project={project} />}
        </div>
      </div>

      {can("dashboard.search") && <QuickSearch project={project} />}

      <QuickActions project={project} />

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {data.overview && (
            <section aria-label={t("overview.title")} className="space-y-3">
              <h2 className="text-sm font-semibold">{t("overview.title")}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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
                  label={t("overview.attendance")}
                  value={data.overview.today.attendance_events}
                  icon={CalendarCheck}
                  href="/attendance"
                />
                <Metric
                  label={t("overview.safety")}
                  value={data.overview.today.safety_incidents}
                  icon={ShieldAlert}
                  href="/safety"
                  tone={data.overview.today.safety_incidents > 0 ? "warning" : undefined}
                />
                <Metric
                  label={t("overview.photos")}
                  value={data.overview.today.photos}
                  icon={Camera}
                  href="/evidence"
                />
                {/* Small cards, as asked, rather than another section. Each
                    one links to the list it counted - a number you cannot
                    click through to is how F-220 happened. */}
                <Metric
                  label={t("overview.materialReceipts")}
                  value={data.overview.today.material_receipts}
                  icon={PackageCheck}
                  href="/receipts"
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
                {/* The last two of the four cards the customer asked for.
                    They needed fields that existed nowhere, which is why they
                    arrived a round later than the other two (T-188). */}
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
              </div>
              <div className="flex flex-wrap gap-2">
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
              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{t("safetySummary.title")}</h3>
                    <p className="text-xs text-muted-foreground">{t("safetySummary.subtitle")}</p>
                  </div>
                  <Link href="/hazard-rectifications" className="text-xs font-semibold text-primary hover:underline">
                    {t("safetySummary.open")}
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {/* 逾期 is red on the home page and nowhere else - U-029 was
                      decided as 「只在首页红一下」, no escalation. But red has to
                      lead somewhere: the number used to be unclickable, so a
                      manager who saw three overdue hazards had to go and find
                      them by hand. `overdue=1` on the list applies the same
                      definition this figure is counted with, so the link lands
                      on exactly the hazards it named. */}
                  {(["today_inspections", "pending_rectification", "in_progress", "overdue", "completed"] as const).map((key) => {
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
                      <Link key={key} href="/hazard-rectifications?overdue=1" className="block transition-transform hover:scale-[1.02]">
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
              </div>
              <ScheduleSummary schedule={data.overview.schedule} />
            </section>
          )}


          <div className="grid gap-6 xl:grid-cols-2">

            {unread && (unread.receipts > 0 || unread.approvals > 0) && (
              // Only drawn when something is actually waiting. A card that is
              // always there, reading zero, is the shape of thing people stop
              // seeing - and being seen is the entire point of this one
              // (user, 2026-09-05: "it should be obvious").
              <Block
                title={t("unread.title")}
                subtitle={t("unread.subtitle", {
                  receipts: unread.receipts,
                  approvals: unread.approvals,
                })}
                empty={false}
                emptyLabel=""
                action={
                  <Link
                    href="/material-columns"
                    className="text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("unread.openColumns")}
                  </Link>
                }
              >
                <p className="pb-2 text-xs text-muted-foreground">
                  {t("unread.help")}
                </p>
                <ul className="divide-y">
                  {unread.columns.map((column) => (
                    <li
                      key={column.category ?? "unfiled"}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <Link
                        href={
                          column.category
                            ? `/receipts?category=${column.category}&seen=false`
                            : "/receipts?category=__unfiled__&seen=false"
                        }
                        className="min-w-0 flex-1 text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {column.name || t("unread.unfiled")}
                        {column.code && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {column.code}
                          </span>
                        )}
                      </Link>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                        {column.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {data.approvals && (
              <Block
                title={t("approvals.title")}
                subtitle={t("approvals.subtitle", {
                  total: data.approvals.total,
                  mine: data.approvals.mine,
                  unassigned: data.approvals.unassigned,
                })}
                empty={data.approvals.rows.length === 0}
                emptyLabel={t("approvals.empty")}
                action={
                  <Link
                    href="/approvals"
                    className="text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("approvals.openCenter")}
                  </Link>
                }
              >
                <ul className="divide-y">
                  {data.approvals.rows.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={approvalHref(row)}
                          className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {row.approval_no
                            ? `${row.approval_no} · ${row.title}`
                            : row.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.has(`approvals.source.${row.source}`)
                            ? t(`approvals.source.${row.source}`)
                            : row.resource_type}{" "}
                          · {row.project || t("approvals.companyWide")} ·{" "}
                          {row.assigned_to || t("approvals.unassigned")}
                          {row.waiting_seconds === null ? null : (
                            <>
                              {" · "}
                              <WaitingFor seconds={row.waiting_seconds} />
                            </>
                          )}
                        </p>
                      </div>
                      <StatusBadge
                        label={
                          t.has(`approvals.status.${row.status}`)
                            ? t(`approvals.status.${row.status}`)
                            : row.status
                        }
                        tone="info"
                      />
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {anomalies && <AnomalyBlock anomalies={anomalies} />}

            {/* Second screen. It used to sit third from the top, above
                everything a manager opens this page to check. Shorter
                now as well - the detail is a click away, and the height
                was pushing 待审批 and 异常事件 below the fold. */}
            <div className="xl:col-span-2">
            {can("field_position.view") && (
              <ContractorLocationMap
                project={project}
                onProjectChange={setProject}
              />
            )}
            </div>

            {activity && (
              <Block
                title={t("activity.title")}
                subtitle={t("activity.subtitle", { count: activity.total })}
                empty={activity.rows.length === 0}
                emptyLabel={t("activity.empty")}
              >
                <ul className="divide-y">
                  {activity.rows.map((row, index) => (
                    <li
                      key={`${row.kind}-${row.reference}-${index}`}
                      className="flex items-start justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={ACTIVITY_HREF[row.kind]}
                          className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {t(`activityKind.${row.kind}`)} · {row.reference}
                        </Link>
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
              </Block>
            )}

            {data.personnel && (
              <Block
                title={t("personnel.title")}
                subtitle={t("personnel.subtitle", {
                  workers: data.personnel.unique_workers,
                })}
                empty={data.personnel.by_project.length === 0}
                emptyLabel={t("personnel.empty")}
              >
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
              </Block>
            )}

            {data.photos && (
              <Block
                title={t("photos.title")}
                subtitle={t("photos.subtitle", { count: data.photos.total })}
                empty={data.photos.rows.length === 0}
                emptyLabel={t("photos.empty")}
              >
                <ul className="divide-y">
                  {data.photos.rows.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-3">
                        {row.image ? (
                          <a
                            href={row.image}
                            target="_blank"
                            rel="noreferrer"
                            className="relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted"
                          >
                            <Image
                              src={row.image}
                              alt={row.project || t("photos.noProject")}
                              fill
                              sizes="64px"
                              className="object-cover"
                              unoptimized
                            />
                          </a>
                        ) : (
                          <div className="grid size-16 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
                            <Camera className="size-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.project || t("photos.noProject")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.photographer || t("photos.unknownPhotographer")} ·{" "}
                          {row.source_model}
                        </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p>{df.dateTime(row.captured_at)}</p>
                        {row.latitude && row.longitude ? (
                          <p className="flex items-center justify-end gap-1">
                            <MapPin className="size-3" />
                            {Number(row.latitude).toFixed(4)},{" "}
                            {Number(row.longitude).toFixed(4)}
                          </p>
                        ) : (
                          <p>{t("photos.noGps")}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {notifications && (
              <Block
                title={t("notifications.title")}
                subtitle={t("notifications.subtitle", {
                  unread: notifications.unread,
                  today: notifications.today,
                })}
                empty={notifications.rows.length === 0}
                emptyLabel={t("notifications.empty")}
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
                <ul className="divide-y">
                  {notifications.rows.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.message}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {!row.read_at && (
                          <StatusBadge label={t("notifications.unread")} tone="info" />
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {df.relative(row.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </div>

          {data.timeline && (
            <Block
              title={t("timeline.title")}
              subtitle={t("timeline.subtitle", { count: data.timeline.total })}
              empty={data.timeline.entries.length === 0}
              emptyLabel={t("timeline.empty")}
            >
              <ol className="relative space-y-3 border-l pl-5">
                {data.timeline.entries.map((entry, index) => (
                  <li key={`${entry.kind}-${index}`} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[1.4rem] top-1.5 size-2 rounded-full bg-border ring-2 ring-background"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm">
                        <span className="font-medium">{entry.label}</span>
                        {entry.project && (
                          <span className="text-muted-foreground"> · {entry.project}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          label={t(`timelineKind.${entry.kind}`)}
                          tone={severityTone(entry.severity)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {df.dateTime(entry.at)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Block>
          )}
        </>
      )}
    </div>
  );
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
      href: `/project-categories?project=${encodeURIComponent(project)}&create=1`,
      label: t("category"),
      icon: FolderPlus,
      requiresProject: true,
    },
    { href: "/documents?create=1", label: t("document"), icon: FilePlus2 },
    { href: "/approvals?create=1", label: t("approval"), icon: ClipboardCheck },
    { href: "/notifications?create=1", label: t("notification"), icon: BellPlus },
  ];
  return (
    <section aria-label={t("title")} className="space-y-2">
      <h2 className="text-sm font-semibold">{t("title")}</h2>
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
    </section>
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
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="rounded-md bg-primary/10 p-2 text-primary">
            <CalendarRange className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{t("title")}</h3>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <Link href="/schedule" className="text-xs font-semibold text-primary hover:underline">
          {t("open")}
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
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

function AnomalyBlock({ anomalies }: { anomalies: DashboardAnomalies }) {
  const t = useTranslations("contractorDashboard");
  const df = useDateFormat();
  // From the totals, not the lists: the lists stop at fifty, so a busy
  // month of anomalies would have said "nothing to see" on the fifty-first.
  const nothing = anomalies.total === 0;

  return (
    <Block
      title={t("anomalies.title")}
      subtitle={t("anomalies.subtitle", { count: anomalies.total })}
      empty={nothing}
      emptyLabel={t("anomalies.empty")}
    >
      {anomalies.geofence_total > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {t("anomalies.geofenceWindow", {
            days: anomalies.geofence_window_days,
            count: anomalies.geofence_total,
          })}
        </p>
      )}
      <ul className="divide-y">
        {anomalies.overdue_rectifications.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link
                href={`/hazard-rectifications?incident=${row.id}`}
                className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row.incident_no} · {row.title}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{row.project}</p>
            </div>
            <StatusBadge
              label={t("anomalies.daysOverdue", { days: row.days_overdue })}
              tone="danger"
            />
          </li>
        ))}
        {anomalies.geofence_failures.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link
                href="/attendance"
                className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("anomalies.geofenceFailure")} · {row.worker}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {row.project} · {df.dateTime(row.occurred_at)}
              </p>
            </div>
            <StatusBadge
              label={
                row.distance_m
                  ? t("anomalies.distance", { metres: Number(row.distance_m) })
                  : t("anomalies.outside")
              }
              tone="warning"
            />
          </li>
        ))}
        {anomalies.expiring_permits.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link
                href="/site-access"
                className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row.pass_no} · {row.subject_name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{row.project}</p>
            </div>
            <StatusBadge
              label={t("anomalies.expiresAt", { at: df.date(row.valid_until) })}
              tone="warning"
            />
          </li>
        ))}
      </ul>
    </Block>
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
        <div className="rounded-lg border bg-card p-3 shadow-sm">
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
function WaitingFor({ seconds }: { seconds: number }) {
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
      className={`rounded-lg border bg-card px-3 py-2 ${
        tone === "warning" ? "border-warning/40" : ""
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">
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
      className={`min-h-24 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        tone === "warning" ? "border-warning/40" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">
        {format.number(value)}
      </p>
    </Link>
  );
}

function Block({
  title,
  subtitle,
  empty,
  emptyLabel,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  emptyLabel?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-1 max-h-96 overflow-y-auto">{children}</div>
      )}
    </section>
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
