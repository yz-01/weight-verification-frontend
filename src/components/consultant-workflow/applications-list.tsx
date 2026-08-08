"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck,
  FilePlus2,
  KeyRound,
  Loader2,
  Search,
  Settings2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConsultantApplicationStatus } from "@/interfaces/consultant-workflow";
import { useDateFormat } from "@/lib/dates";
import { getConsultantApplications } from "@/services/consultant-workflow.service";

const tones: Record<
  ConsultantApplicationStatus,
  "neutral" | "positive" | "warning" | "danger" | "info"
> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "positive",
  REJECTED: "danger",
  REVISE_RESUBMIT: "warning",
  ARCHIVED: "info",
};

export function ConsultantApplicationsList() {
  const t = useTranslations("consultantWorkflow");
  const { user, can } = useAuth();
  const df = useDateFormat();
  const [project, setProject] = useState("");
  const [search, setSearch] = useState("");
  const onProjectChange = useCallback((id: string) => setProject(id), []);
  const needsProject = user?.account_type === "CONSULTANT";
  const rows = useQuery({
    queryKey: ["consultant-applications", project, search],
    queryFn: () =>
      getConsultantApplications({
        project: project || undefined,
        search: search || undefined,
        page_size: 200,
      }),
    enabled: !needsProject || Boolean(project),
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
                <Link href="/consultant-workflows">
                  <Settings2 />
                  {t("workflow.shortTitle")}
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

      {needsProject && !project ? (
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
                    <p className="truncate font-semibold">
                      {application.application_no}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {application.application_type_custom ||
                        application.application_type_label}
                      {" / "}
                      {application.discipline_custom || application.discipline_label}
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
