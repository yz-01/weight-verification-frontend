"use client";

/**
 * 「报表导出历史」's top lines: the reports still being made in the background,
 * and the ones that were not made (JB48, Lucas 10-28).
 *
 * A business report of more than 20 records is built on the server while the
 * person carries on; the bell rings when it is ready, and it then appears in
 * the history below as an ordinary row. Until then it says 「准备中」 here. One
 * that did not work says why in plain words, with 「重新导出」 back to the
 * report page it came from. Nothing is shown when there is nothing to say.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type { ContractorReportJob } from "@/interfaces/contractor-report";
import { useDateFormat } from "@/lib/dates";
import { getContractorReportJobs } from "@/services/contractor-report.service";

/** How often the list asks again while something is being made. */
const POLL_MS = 10_000;

/** The report page a job's 「重新导出」 opens when it kept none. */
export function reportPageOf(job: Pick<ContractorReportJob, "report_type" | "return_to">): string {
  if (job.return_to) return job.return_to;
  if (job.report_type === "material_report") return "/reports/material-quantity";
  return `/reports/contractor/${job.report_type}`;
}

export function ReportJobs() {
  const t = useTranslations("contractorReports.jobs");
  const report = useTranslations("contractorReports.type");
  const router = useRouter();
  const queryClient = useQueryClient();
  const df = useDateFormat();
  const jobs = useQuery({
    queryKey: ["contractor-reports", "jobs"],
    queryFn: getContractorReportJobs,
    // A report queued on another page must show the moment this one opens.
    refetchOnMount: "always",
    refetchInterval: (query) =>
      (query.state.data ?? []).some((job) => job.status === "PREPARING") ? POLL_MS : false,
  });
  const preparing = (jobs.data ?? []).filter((job) => job.status === "PREPARING").length;
  // A job that finished leaves this list and joins the history below.
  const before = useRef(preparing);
  useEffect(() => {
    if (preparing < before.current) {
      void queryClient.invalidateQueries({ queryKey: ["contractor-reports", "history"] });
    }
    before.current = preparing;
  }, [preparing, queryClient]);

  const rows = jobs.data ?? [];
  if (!rows.length) {
    return <QueryFailedNote query={jobs} what={t("what")} />;
  }
  return (
    <section className="surface-panel rounded-xl p-4" data-slot="report-jobs">
      <h2 className="panel-title mb-2">{t("title")}</h2>
      <ul className="divide-y divide-panel-border">
        {rows.map((job) => {
          const name = job.title || (report.has(job.report_type) ? report(job.report_type) : job.report_type);
          return (
            <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-slot="report-job">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("records", { count: job.record_count })} · {df.dateTime(job.created_at)}
                </p>
                {job.status === "PREPARING" ? (
                  <p className="text-xs text-muted-foreground">{t("preparingHint")}</p>
                ) : (
                  <p className="text-xs text-destructive">{t(`failure.${job.failure === "interrupted" ? "interrupted" : "failed"}`)}</p>
                )}
              </div>
              {job.status === "PREPARING" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <StatusBadge label={t("preparing")} tone="primary" />
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <StatusBadge label={t("failed")} tone="attention" />
                  <Button size="sm" variant="outline" onClick={() => router.push(reportPageOf(job))}>
                    <RotateCcw />
                    {t("again")}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
