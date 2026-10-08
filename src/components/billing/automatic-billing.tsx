"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw, ServerCog } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { EmptyState, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BillingJobState } from "@/interfaces/billing";
import { useDateFormat } from "@/lib/dates";
import { getAutomaticBilling, runAutomaticBilling } from "@/services/billing.service";

const STATE_TONE: Record<BillingJobState, "positive" | "info" | "warning" | "danger" | "neutral"> = {
  QUEUED: "info",
  RUNNING: "info",
  RETRY_WAIT: "warning",
  SUCCEEDED: "positive",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export function AutomaticBilling() {
  const t = useTranslations("billing.automatic");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["billing", "automatic"],
    queryFn: getAutomaticBilling,
    refetchInterval: 15_000,
  });
  const runNow = useMutation({
    mutationFn: runAutomaticBilling,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing", "automatic"] }),
  });

  if (status.isLoading) return <p className="py-10 text-sm text-muted-foreground">{common("loading")}</p>;
  if (status.isError) return <p className="py-10 text-sm text-destructive">{t("loadError")}</p>;

  const job = status.data?.job;
  const runs = status.data?.runs ?? [];
  if (!job) {
    return <EmptyState icon={ServerCog} title={t("notConfigured")} />;
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <div className="rounded-xl border border-info/40 bg-info/10 px-4 py-3">
        <p className="text-sm font-semibold">{t("purposeTitle")}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("purposeDescription")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><ServerCog className="size-4.5" /></span>
          <div className="min-w-0"><p className="text-sm font-semibold">{job.name}</p><p className="text-xs text-muted-foreground">{job.code}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}><RefreshCw className={status.isFetching ? "animate-spin" : ""} />{common("refresh")}</Button>
          {can("billing.manage") && <Button onClick={() => runNow.mutate()} disabled={!job.is_active || runNow.isPending}><Play />{t("runNow")}</Button>}
        </div>
      </div>

      <div className="surface-panel overflow-hidden rounded-xl">
        <div className="-mb-px -mr-px grid sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("field.status")} value={<StatusBadge label={t(job.is_active ? "active" : "inactive")} tone={job.is_active ? "positive" : "neutral"} />} />
        <Metric label={t("field.nextRun")} value={job.next_run_at ? df.dateTime(job.next_run_at) : common("emptyValue")} />
        <Metric label={t("field.lastRun")} value={job.last_run_at ? df.dateTime(job.last_run_at) : common("emptyValue")} />
        <Metric label={t("field.interval")} value={job.interval_minutes ? t("intervalMinutes", { count: job.interval_minutes }) : common("emptyValue")} />
        </div>
      </div>

      <section>
        <h3 className="panel-title mb-3">{t("history")}</h3>
        <div className="surface-panel overflow-hidden rounded-xl">
          <Table className="min-w-190">
            <TableHeader><TableRow><TableHead>{t("field.scheduledFor")}</TableHead><TableHead>{t("field.state")}</TableHead><TableHead className="text-right tabular">{t("field.attempt")}</TableHead><TableHead className="text-right tabular">{t("field.saasIssued")}</TableHead><TableHead className="text-right tabular">{t("field.commissionIssued")}</TableHead><TableHead className="text-right tabular">{t("field.overdueUpdated")}</TableHead><TableHead>{t("field.error")}</TableHead></TableRow></TableHeader>
            <TableBody>{runs.length === 0 ? <TableRow><TableCell colSpan={7} className="h-24 justify-center text-center text-muted-foreground">{t("empty")}</TableCell></TableRow> : runs.map((run) => <TableRow key={run.id}><TableCell className="tabular">{df.dateTime(run.scheduled_for)}</TableCell><TableCell><StatusBadge label={t(`state.${run.state}`)} tone={STATE_TONE[run.state]} /></TableCell><TableCell className="text-right tabular">{run.attempt}/{run.max_attempts}</TableCell><TableCell className="text-right tabular">{numberResult(run.result.saas_issued)}</TableCell><TableCell className="text-right tabular">{numberResult(run.result.commission_issued)}</TableCell><TableCell className="text-right tabular">{numberResult(run.result.overdue_updated)}</TableCell><TableCell className="max-w-64 truncate text-destructive" title={run.error}>{run.error || common("emptyValue")}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-h-24 border-b border-r p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><div className="tabular mt-3 text-sm font-semibold">{value}</div></div>;
}

function numberResult(value: unknown): string {
  return typeof value === "number" ? String(value) : "-";
}
