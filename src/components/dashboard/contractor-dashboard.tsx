"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BellPlus,
  CalendarRange,
  CalendarCheck,
  Camera,
  ClipboardCheck,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FolderPlus,
  HardHat,
  Inbox,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ContractorLocationMap } from "@/components/dashboard/contractor-location-map";
import { useAuth } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ActivityRow,
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

export function ContractorDashboard() {
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

  if (full.isError) {
    return (
      <div className="border-y py-12 text-center text-sm text-muted-foreground">
        {t("error")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                  {(["today_inspections", "pending_rectification", "in_progress", "overdue", "completed"] as const).map((key) => (
                    <div key={key} className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">{t(`safetySummary.${key}`)}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{format.number(data.overview?.safety[key] ?? 0)}</p>
                    </div>
                  ))}
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

          {can("field_position.view") && (
            <ContractorLocationMap
              project={project}
              onProjectChange={setProject}
            />
          )}

          <div className="grid gap-6 xl:grid-cols-2">
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
                        <StatusBadge label={row.status} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {df.dateTime(row.occurred_at)}
                        </p>
                      </div>
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
                          href={`/approvals?approval=${row.id}`}
                          className="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {row.approval_no} · {row.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.project || t("approvals.companyWide")} ·{" "}
                          {row.assigned_to || t("approvals.unassigned")}
                        </p>
                      </div>
                      <StatusBadge label={row.status} tone="info" />
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {anomalies && <AnomalyBlock anomalies={anomalies} />}

            {data.personnel && (
              <Block
                title={t("personnel.title")}
                subtitle={t("personnel.subtitle", {
                  workers: data.personnel.unique_workers,
                })}
                empty={data.personnel.by_project.length === 0}
                emptyLabel={t("personnel.empty")}
              >
                <div className="mb-3 flex flex-wrap gap-2">
                  {Object.entries(data.personnel.by_event).map(([event, count]) => (
                    <span
                      key={event}
                      className="rounded-full border bg-card px-3 py-1 text-xs font-medium"
                    >
                      {t(`attendanceEvent.${event}`)}{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {format.number(count)}
                      </span>
                    </span>
                  ))}
                  {data.personnel.geofence_failures > 0 && (
                    <StatusBadge
                      label={t("personnel.geofenceFailures", {
                        count: data.personnel.geofence_failures,
                      })}
                      tone="warning"
                    />
                  )}
                </div>
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
                  count: notifications.total,
                  unread: notifications.unread,
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
  const nothing =
    anomalies.geofence_failures.length === 0 &&
    anomalies.overdue_rectifications.length === 0 &&
    anomalies.expiring_permits.length === 0;

  return (
    <Block
      title={t("anomalies.title")}
      subtitle={t("anomalies.subtitle", { count: anomalies.total })}
      empty={nothing}
      emptyLabel={t("anomalies.empty")}
    >
      <ul className="divide-y">
        {anomalies.overdue_rectifications.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link
                href="/hazard-rectifications"
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
          {results.isLoading ? (
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
                  {row.status && <StatusBadge label={row.status} />}
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
