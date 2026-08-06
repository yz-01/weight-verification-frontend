"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Play, RefreshCw, ServerCog } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
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
    return <div className="rounded-lg border border-dashed px-6 py-14 text-center"><ServerCog className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t("notConfigured")}</p></div>;
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><ServerCog className="size-4.5" /></span>
          <div><p className="text-sm font-semibold">{job.name}</p><p className="text-xs text-muted-foreground">{job.code}</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => status.refetch()} disabled={status.isFetching}><RefreshCw className={status.isFetching ? "animate-spin" : ""} />{common("refresh")}</Button>
          {can("billing.manage") && <Button size="sm" onClick={() => runNow.mutate()} disabled={!job.is_active || runNow.isPending}><Play />{t("runNow")}</Button>}
        </div>
      </div>

      <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("field.status")} value={<StatusBadge label={t(job.is_active ? "active" : "inactive")} tone={job.is_active ? "positive" : "neutral"} />} />
        <Metric label={t("field.nextRun")} value={job.next_run_at ? df.dateTime(job.next_run_at) : common("emptyValue")} />
        <Metric label={t("field.lastRun")} value={job.last_run_at ? df.dateTime(job.last_run_at) : common("emptyValue")} />
        <Metric label={t("field.interval")} value={job.interval_minutes ? t("intervalMinutes", { count: job.interval_minutes }) : common("emptyValue")} />
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2"><Clock3 className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">{t("history")}</h3></div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/35 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">{t("field.scheduledFor")}</th><th className="px-4 py-3">{t("field.state")}</th><th className="px-4 py-3">{t("field.attempt")}</th><th className="px-4 py-3">{t("field.saasIssued")}</th><th className="px-4 py-3">{t("field.commissionIssued")}</th><th className="px-4 py-3">{t("field.overdueUpdated")}</th><th className="px-4 py-3">{t("field.error")}</th></tr></thead>
            <tbody>{runs.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">{t("empty")}</td></tr> : runs.map((run) => <tr key={run.id} className="border-b last:border-0"><td className="px-4 py-3 tabular-nums">{df.dateTime(run.scheduled_for)}</td><td className="px-4 py-3"><StatusBadge label={t(`state.${run.state}`)} tone={STATE_TONE[run.state]} /></td><td className="px-4 py-3 tabular-nums">{run.attempt}/{run.max_attempts}</td><td className="px-4 py-3 tabular-nums">{numberResult(run.result.saas_issued)}</td><td className="px-4 py-3 tabular-nums">{numberResult(run.result.commission_issued)}</td><td className="px-4 py-3 tabular-nums">{numberResult(run.result.overdue_updated)}</td><td className="max-w-64 truncate px-4 py-3 text-destructive" title={run.error}>{run.error || common("emptyValue")}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-h-24 border-b border-r p-4"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-3 text-sm font-semibold tabular-nums">{value}</div></div>;
}

function numberResult(value: unknown): string {
  return typeof value === "number" ? String(value) : "-";
}
