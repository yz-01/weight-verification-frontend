"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import type { IncidentReportThread } from "@/interfaces/incident-report";
import { getIncidentThreads } from "@/services/site-operations.service";

import { CreateIncidentDialog } from "./create-incident-dialog";
import { IncidentThreadDetail } from "./incident-thread-detail";

export function IncidentThreadList() {
  const t = useTranslations("incidentReporting");
  const safetyT = useTranslations("safety.filter");
  const searchParams = useSearchParams();
  const requestedThread = searchParams.get("thread");
  const requestedProject = searchParams.get("project") ?? "all";
  const [selectedThread, setSelectedThread] = useState(requestedThread);
  const [selectedProject, setSelectedProject] = useState(requestedProject);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedThread(requestedThread);
      setSelectedProject(requestedProject);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedProject, requestedThread]);

  const replaceUrl = (projectId: string, threadId: string | null) => {
    const url = new URL(window.location.href);
    if (projectId === "all") url.searchParams.delete("project");
    else url.searchParams.set("project", projectId);
    if (threadId) url.searchParams.set("thread", threadId);
    else url.searchParams.delete("thread");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  const threads = useQuery({
    queryKey: ["incident-threads", selectedProject],
    queryFn: () =>
      getIncidentThreads({
        page_size: 100,
        // The API takes a field and a direction. A "-field" string matches
        // no allowed field and silently falls back to the viewset's own
        // default, which here is -occurred_at: an incident that happened last
        // week but was filed today would sort as a week-old thread.
        sort_by: "created_at",
        sort_order: "desc",
        project: selectedProject === "all" ? undefined : selectedProject,
      }),
  });

  const selectProject = (projectId: string) => {
    setSelectedProject(projectId);
    setSelectedThread(null);
    replaceUrl(projectId, null);
  };

  const selectThread = (threadId: string | null) => {
    setSelectedThread(threadId);
    replaceUrl(selectedProject, threadId);
  };

  if (selectedThread) {
    return (
      <IncidentThreadDetail
        threadId={selectedThread}
        onBack={() => selectThread(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t("title")}</h3>
          <Button onClick={() => setShowCreate(true)}>
            {t("action.reportIncident")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-y bg-card/50 py-3">
          <ProjectPicker
            value={selectedProject}
            onValueChange={selectProject}
            placeholder={safetyT("project")}
            allowAll
            allLabel={safetyT("allProjects")}
            className="w-full sm:w-[280px]"
          />
        </div>

        {threads.isLoading && (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

        {threads.isError && (
          <LoadFailed what={t("what.threads")} onRetry={() => threads.refetch()} />
        )}

        {!threads.isError && threads.data?.results.length === 0 && (
          <p className="rounded-xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        <div className="space-y-3">
          {threads.data?.results.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              onClick={() => selectThread(thread.id)}
            />
          ))}
        </div>
      </section>

      {showCreate && (
        <CreateIncidentDialog
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            void threads.refetch();
          }}
        />
      )}
    </div>
  );
}

function ThreadCard({
  thread,
  onClick,
}: {
  thread: IncidentReportThread;
  onClick: () => void;
}) {
  const t = useTranslations("incidentReporting");
  const severityTone =
    thread.severity === "CRITICAL"
      ? "danger"
      : thread.severity === "HIGH"
        ? "warning"
        : thread.severity === "MEDIUM"
          ? "info"
          : "neutral";

  return (
    <article
      className="cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={t(`severity.${thread.severity}`)}
              tone={severityTone}
            />
            {thread.is_resolved && (
              <StatusBadge label={t("status.resolved")} tone="positive" />
            )}
          </div>
          <p className="mt-2 font-semibold">{thread.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {thread.project_name}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare className="size-3.5" />
            <span>
              {thread.message_count} {t("label.messages")}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {new Date(thread.created_at).toLocaleString()}
          </p>
        </div>
        <AlertCircle className="size-5 shrink-0 text-muted-foreground" />
      </div>
    </article>
  );
}
