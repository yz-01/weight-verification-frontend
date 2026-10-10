"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ClipboardCheck,
  FileCheck2,
  FilePlus2,
  FileText,
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

import { usePackList } from "@/components/contractor-ops/pack-collect";
import { PhotoThumb } from "@/components/shared/photo-thumb";
import { useAuth } from "@/components/providers/auth-provider";
import { ConsultantHowTo } from "@/components/consultant-workflow/consultant-how-to";
import { ConsultantFieldInbox } from "@/components/consultant-workflow/field-inbox";
import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import { usePageProject } from "@/components/providers/current-project-provider";
import {
  NeedsActionChip,
  NeedsActionMarker,
  useNeedsActionParam,
} from "@/components/shared/needs-action";
import { FilterBar, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
  // 「待处理 N」 (2026-10-09): only the applications waiting for this
  // reader's review - the sidebar's number for 顾问申请.
  const [waitingOnly, setWaitingOnly] = useNeedsActionParam();
  // The 「待整理现场资料」 notice names the submission's project, so the
  // inbox opens on that site (C1, B4 audit #12).
  // For the contractor's office, the top bar's 「当前项目」 (B13), which the
  // notice's `?project=` moves.
  const [project, setProject] = usePageProject(searchParams.get("project") ?? "");
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
  const onProjectChange = useCallback((id: string) => setProject(id), [setProject]);
  const needsProject = user?.account_type === "CONSULTANT";
  // query-failure: only the tab's number; the tab itself says when it fails.
  const toOrganize = useQuery({
    queryKey: ["field-tasks", "to-organize", "count", project],
    queryFn: () =>
      getFieldTasks({ to_organize: "1", project: project || undefined, page_size: 1 }),
    enabled: canOrganize,
  });
  const rows = useQuery({
    queryKey: ["consultant-applications", project, search, stage, waitingOnly],
    queryFn: () =>
      getConsultantApplications({
        project: project || undefined,
        search: search || undefined,
        stage: stage === "all" ? undefined : stage,
        needs_action: waitingOnly ? "1" : undefined,
        page_size: 200,
      }),
    enabled: stage !== "inbox" && (!needsProject || Boolean(project)),
  });
  // Multi Engine picks applications here too (2026-10-10, 补充 1): 「✅ 已打包
  // X 次」 on a row, and tick boxes while a package is being put together.
  const pack = usePackList({ kind: "CONSULTANT_APPLICATION" }, rows.data?.results ?? []);

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("applications.title")}
        subtitle={t("applications.subtitle", { count: rows.data?.count ?? 0 })}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <NeedsActionChip
              count={rows.data?.needs_action_count}
              active={waitingOnly}
              onToggle={setWaitingOnly}
            />
            {can("approval.review") && (
              <Button asChild variant="outline">
                <Link href="/approval-credential">
                  <KeyRound />
                  {t("credential.shortTitle")}
                </Link>
              </Button>
            )}
            {can("consultant.config") && (
              <Button asChild variant="outline">
                <Link href="/consultant-settings">
                  <Settings2 />
                  {t("settingsHub.title")}
                </Link>
              </Button>
            )}
            {can("consultant.submit") && (
              <Button asChild>
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

      <FilterBar>
        <ConsultantProjectPicker
          value={project}
          onChange={onProjectChange}
          allowAll
        />
        <div className="relative min-w-0 flex-1 sm:min-w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("applications.search")}
            className="pl-9"
          />
        </div>
      </FilterBar>

      <nav
        aria-label={t("applications.stageLabel")}
        className={`surface-panel grid grid-cols-2 gap-2 rounded-xl p-2 ${
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
              className={`flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-center text-base font-semibold transition-colors ${
                stage === value
                  ? "bg-primary/12 text-tone-cyan-fg ring-1 ring-primary/35"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
        <div className="overflow-hidden surface-panel rounded-xl">
          {pack.bar}
          <div className="divide-y">
            {rows.data.results.map((application) => (
              <div key={application.id} className="flex flex-wrap items-center sm:flex-nowrap">
                {pack.picking && <div className="flex items-center self-stretch pl-4">{pack.check(application.id)}</div>}
                <Link
                  href={`/consultant-applications/${application.id}`}
                  className="grid min-w-0 flex-1 gap-3 p-4 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {/* The linked site photograph (E3); the row is a link to
                        the application, so the picture is not a second one. */}
                    <PhotoThumb
                      coverUrl={application.cover_photo_url}
                      count={application.photo_count}
                      icon={ClipboardCheck}
                      reference={application.application_no}
                      openable={false}
                    />
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
                    <NeedsActionMarker show={application.needs_action} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {df.date(application.application_date)}
                    </span>
                    <StatusBadge
                      label={t(`status.${application.status}`)}
                      tone={tones[application.status]}
                    />
                  </div>
                </Link>
                {pack.showColumn && (
                  <div className="flex w-full items-center px-4 pb-3 empty:hidden sm:w-auto sm:pb-0">
                    {pack.badge(application.id)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {pack.overlay}
    </div>
  );
}

function EmptyState({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div
      className={
        danger
          ? "rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive"
          : "rounded-xl border border-dashed border-panel-border p-10 text-center text-sm text-muted-foreground"
      }
    >
      {text}
    </div>
  );
}
