"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type { IncidentReportThread } from "@/interfaces/incident-report";
import { getIncidentThreads } from "@/services/site-operations.service";

import { CreateIncidentDialog } from "./create-incident-dialog";
import { IncidentThreadDetail } from "./incident-thread-detail";

export function IncidentThreadList() {
  const t = useTranslations("incidentReporting");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedThread = searchParams.get("thread");
  const [showCreate, setShowCreate] = useState(false);

  const threads = useQuery({
    queryKey: ["incident-threads"],
    queryFn: () => getIncidentThreads({ page_size: 100, sort_by: "-created_at" }),
  });

  const selectThread = (threadId: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (threadId) next.set("thread", threadId);
    else next.delete("thread");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
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

        {threads.isLoading && (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

        {threads.data?.results.length === 0 && (
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
