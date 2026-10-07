"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FilePlus2,
  Images,
  KeyRound,
  Loader2,
  Search,
  Settings2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConsultantHowTo } from "@/components/consultant-workflow/consultant-how-to";
import { ConsultantFieldInbox } from "@/components/consultant-workflow/field-inbox";
import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { RecordNo } from "@/components/shared/record-no";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConsultantApplicationStatus } from "@/interfaces/consultant-workflow";
import { useDateFormat } from "@/lib/dates";
import { getConsultantApplications } from "@/services/consultant-workflow.service";
import { getFieldTasks } from "@/services/contractor-ops.service";

/**
 * `inbox` is 「待整理现场资料」 (2026-10 C1, Q2): what the site sent in for
 * the consultant and nobody has made into an application yet. It was its own
 * menu entry (「现场资料收件箱」); it is the first step of an application,
 * so it is a tab here - for the office that prepares applications.
 */
const STAGES = ["inbox", "all", "draft", "approval", "final", "archive"] as const;
type ApplicationStage = (typeof STAGES)[number];

const tones: Record<
  ConsultantApplicationStatus,
  "neutral" | "positive" | "warning" | "danger" | "info"
> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "positive",
  APPROVED_WITH_REMEDIAL: "warning",
  REJECTED: "danger",
  REVISE_RESUBMIT: "warning",
  ARCHIVED: "info",
};

export function ConsultantApplicationsList() {
  const t = useTranslations("consultantWorkflow");
  const searchParams = useSearchParams();
  const { user, can } = useAuth();
  const df = useDateFormat();
  // The 「待整理现场资料」 notice names the submission's project, so the
  // inbox opens on that site (C1, B4 audit #12).
  const [project, setProject] = useState(searchParams.get("project") ?? "");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const stageParam = searchParams.get("stage");
  const canOrganize =
    can("consultant.submit") &&
    !user?.is_field_staff &&
    user?.account_type !== "CONSULTANT";
  const stages = STAGES.filter((value) => value !== "inbox" || canOrganize);
  const stage: ApplicationStage = stages.includes(stageParam as ApplicationStage)
    ? (stageParam as ApplicationStage)
    : "all";
  const onProjectChange = useCallback((id: string) => setProject(id), []);
  const needsProject = user?.account_type === "CONSULTANT";
  // query-failure: only the tab's number; the tab itself says when it fails.
  const toOrganize = useQuery({
    queryKey: ["field-tasks", "to-organize", "count", project],
    queryFn: () =>
      getFieldTasks({ to_organize: "1", project: project || undefined, page_size: 1 }),
    enabled: canOrganize,
  });
  const rows = useQuery({
    queryKey: ["consultant-applications", project, search, stage],
    queryFn: () =>
      getConsultantApplications({
        project: project || undefined,
        search: search || undefined,
        stage: stage === "all" ? undefined : stage,
        page_size: 200,
      }),
    enabled: stage !== "inbox" && (!needsProject || Boolean(project)),
  });

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("applications.title")}
        subtitle={t("applications.subtitle", { count: rows.data?.count ?? 0 })}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {can("approval.review") && (
              <Button asChild variant="outline" size="sm">
                <Link href="/approval-credential">
                  <KeyRound />
                  {t("credential.shortTitle")}
                </Link>
              </Button>
            )}
            {can("consultant.config") && (
              <Button asChild variant="outline" size="sm">
                <Link href="/consultant-settings">
                  <Settings2 />
                  {t("settingsHub.title")}
                </Link>
              </Button>
            )}
            {can("consultant.submit") && (
              <Button asChild size="sm">
                <Link href="/consultant-applications/create">
                  <FilePlus2 />
                  {t("applications.create")}
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <ConsultantHowTo
        // Open until the first application exists, so a first-time user
        // meets the three steps; folded after that, one click away.
        defaultOpen={!rows.isLoading && (rows.data?.count ?? 0) === 0}
        canConfigure={can("consultant.config")}
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
        <ConsultantProjectPicker
          value={project}
          onChange={onProjectChange}
          allowAll
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("applications.search")}
            className="pl-9"
          />
        </div>
      </div>

      <nav
        aria-label={t("applications.stageLabel")}
        className={`grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-2 ${
          stages.length === 6 ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-5"
        }`}
      >
        {stages.map((value) => {
          const Icon =
            value === "inbox"
              ? Images
              : value === "draft"
              ? FileText
              : value === "approval"
                ? ClipboardCheck
                : value === "final"
                  ? FileCheck2
                  : value === "archive"
                    ? Archive
                    : Search;
          const href = value === "all" ? "/consultant-applications" : `/consultant-applications?stage=${value}`;
          return (
            <Link
              key={value}
              href={href}
              aria-current={stage === value ? "page" : undefined}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-md px-3 text-center text-base font-semibold transition-colors ${
                stage === value
                  ? "bg-background text-primary shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{t(`applications.stage.${value}`)}</span>
              {value === "inbox" && toOrganize.data?.count ? (
                <span className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-foreground">
                  {toOrganize.data.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {stage === "inbox" ? (
        <ConsultantFieldInbox project={project} focusedTaskId={searchParams.get("task")} />
      ) : needsProject && !project ? (
        <EmptyState text={t("state.chooseProject")} />
      ) : rows.isLoading ? (
        <div className="grid min-h-52 place-items-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : rows.isError ? (
        <EmptyState text={t("state.loadError")} danger />
      ) : !rows.data?.count ? (
        <EmptyState text={t("state.noApplications")} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="divide-y">
            {rows.data.results.map((application) => (
              <Link
                key={application.id}
                href={`/consultant-applications/${application.id}`}
                className="grid gap-3 p-4 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <ClipboardCheck className="size-5" />
                  </span>
                  <div className="min-w-0">
                    {/* Short number big, project small (2026-10 D4). The row is a link, so no copy button
                        inside it; the whole number is on hover. */}
                    <RecordNo
                      value={application.application_no}
                      projectCode={application.project_code}
                      copyable={false}
                    />
                    <p className="truncate text-sm text-muted-foreground">
                      {application.application_type_custom ||
                        application.application_type_label}
                      {/* Optional since 2026-10 (C1). */}
                      {application.discipline_custom || application.discipline_label
                        ? ` / ${application.discipline_custom || application.discipline_label}`
                        : null}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{application.project_name}</p>
                  <p className="truncate text-muted-foreground">
                    {application.consultant_organization_name} - {application.consultant_name}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {df.date(application.application_date)}
                  </span>
                  <StatusBadge
                    label={t(`status.${application.status}`)}
                    tone={tones[application.status]}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div
      className={
        danger
          ? "rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive"
          : "rounded-lg border border-dashed bg-muted/15 p-10 text-center text-sm text-muted-foreground"
      }
    >
      {text}
    </div>
  );
}
