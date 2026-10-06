"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  APPROVAL_PAGE_LINKS,
  useApprovalOpener,
} from "@/components/dashboard/approval-opener";
import { WaitingFor } from "@/components/dashboard/contractor-dashboard";
import { LoadFailed } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApprovalSource } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getApprovalQueue } from "@/services/contractor-dashboard.service";

const PAGE_SIZE = 20;

const SOURCES: ApprovalSource[] = [
  "MATERIAL_REQUEST",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "CONSULTANT_APPLICATION",
  "FIELD_TASK",
  "SUNDRY_CLAIM",
  "APPROVAL",
];

/**
 * 总部集中审批 (C16): every decision waiting across the reader's projects -
 * 项目、事项、提交人、提交时间、已等多久 - filtered by project and kind, paged
 * with 【载入更多】. A row opens the record itself, here on the page, where the
 * module's own approve / return and the record's conversation are; a site
 * task and a document approval open on their own page.
 */
export function HeadquartersApprovals() {
  const t = useTranslations("headquarters.approvals");
  const sources = useTranslations("contractorDashboard.approvals.source");
  const df = useDateFormat();
  const [project, setProject] = useState("");
  const [source, setSource] = useState<ApprovalSource | "">("");
  const opener = useApprovalOpener();
  const query = useInfiniteQuery({
    queryKey: ["contractor-dashboard", "approval-queue", project, source],
    queryFn: ({ pageParam }) =>
      getApprovalQueue({
        page: pageParam,
        page_size: PAGE_SIZE,
        project: project || undefined,
        source: source || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  const first = query.data?.pages[0];
  const counts = first?.by_source ?? {};
  const all = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);

  return (
    <div className="space-y-2" data-headquarters-approvals>
      <div className="flex flex-wrap items-center gap-2">
        <ProjectPicker
          value={project || "all"}
          onValueChange={(next) => setProject(next === "all" ? "" : next)}
          placeholder={t("allProjects")}
          allowAll
          allLabel={t("allProjects")}
          className="w-full sm:w-64"
        />
        {first && (
          <span className="text-xs text-muted-foreground">
            {t("shown", { shown: rows.length, total: first.count })}
          </span>
        )}
      </div>
      <div role="group" aria-label={t("kinds")} className="flex flex-wrap gap-1.5">
        <Chip active={source === ""} onClick={() => setSource("")}>
          {t("allKinds")} {all}
        </Chip>
        {SOURCES.filter((key) => (counts[key] ?? 0) > 0 || source === key).map((key) => (
          <Chip key={key} active={source === key} onClick={() => setSource(key)}>
            {sources(key)} {counts[key] ?? 0}
          </Chip>
        ))}
      </div>

      {query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="max-h-[32rem] divide-y overflow-y-auto rounded-lg border">
          {rows.map((row) => {
            const leaves = row.source in APPROVAL_PAGE_LINKS;
            return (
              <li key={`${row.source}-${row.id}`}>
                <button
                  type="button"
                  onClick={() => opener.open(row)}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                        {sources.has(row.source) ? sources(row.source) : row.resource_type}
                      </span>
                      {row.approval_no ? `${row.approval_no} · ${row.title}` : row.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        row.project || t("companyWide"),
                        row.requested_by,
                        df.dateTime(row.submitted_at || row.created_at),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {row.waiting_seconds !== null && <WaitingFor seconds={row.waiting_seconds} />}
                    {leaves && <ExternalLink className="size-3.5" aria-label={t("opensPage")} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetchingNextPage}
            disabledReason={t("loading")}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage && <Loader2 className="animate-spin" />}
            {t("loadMore")}
          </Button>
        </div>
      )}
      {opener.element}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs tabular-nums",
        active ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted/40",
      )}
    >
      {children}
    </button>
  );
}
