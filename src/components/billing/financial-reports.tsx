"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { FileDown, Landmark, ReceiptText, WalletCards } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InvoiceState } from "@/interfaces/billing";
import {
  exportInvoices,
  exportPayments,
  getFinancialReports,
} from "@/services/billing.service";

type ReportKey = "saas" | "commission" | "receivables" | "paid" | "unpaid";

const REPORTS: Array<{ key: ReportKey; icon: typeof ReceiptText; query: Record<string, string | boolean> }> = [
  { key: "saas", icon: ReceiptText, query: { kind: "SAAS", issued_only: true } },
  { key: "commission", icon: Landmark, query: { kind: "COMMISSION", issued_only: true } },
  { key: "receivables", icon: WalletCards, query: { issued_only: true } },
  { key: "paid", icon: ReceiptText, query: { state: "CONFIRMED" } },
  { key: "unpaid", icon: WalletCards, query: { unpaid: true } },
];

export function FinancialReports() {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const format = useFormatter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const summaries = useQuery({
    queryKey: ["billing", "financial-reports", from, to],
    queryFn: () => getFinancialReports({ date_from: from || undefined, date_to: to || undefined }),
  });
  const exporting = useMutation({
    mutationFn: ({ report, format }: { report: (typeof REPORTS)[number]; format: "pdf" | "xlsx" }) =>
      (report.key === "paid" ? exportPayments : exportInvoices)({
        format,
        title: t(`financialReports.${report.key}.title`),
        subtitle: t(`financialReports.${report.key}.subtitle`),
        emptyLabel: common("emptyValue"),
        query: {
          ...report.query,
          date_basis: report.key === "paid" ? undefined : "issued",
          date_from: from || undefined,
          date_to: to || undefined,
        },
        columns: report.key === "paid" ? paymentColumns(t) : reportColumns(t),
      }),
  });

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <FieldWrapper label={t("filters.from")}><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></FieldWrapper>
        <FieldWrapper label={t("filters.to")}><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></FieldWrapper>
      </div>
      {summaries.isError && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("financialReports.loadError")}</p>}
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          const totals = summaries.data?.reports[report.key];
          return (
            <section key={report.key} className="border-b p-5 last:border-0">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="size-4.5" /></span>
                <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{t(`financialReports.${report.key}.title`)}</h3><p className="mt-1 text-xs text-muted-foreground">{t(`financialReports.${report.key}.subtitle`)}</p></div>
                <div className="flex gap-2"><Button variant="outline" size="sm" disabled={exporting.isPending} onClick={() => exporting.mutate({ report, format: "pdf" })}><FileDown />PDF</Button><Button size="sm" disabled={exporting.isPending} onClick={() => exporting.mutate({ report, format: "xlsx" })}><FileDown />Excel</Button></div>
              </div>
              <div className="mt-4 grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
                {report.key === "paid" ? (
                  <>
                    <ReportMetric label={t("financialReports.metric.paymentCount")} value={metric(totals?.payment_count, summaries.isLoading)} />
                    <ReportMetric label={t("financialReports.metric.invoiceCount")} value={metric(totals?.invoice_count, summaries.isLoading)} />
                    <ReportMetric label={t("financialReports.metric.collected")} value={money(totals?.collected, summaries.isLoading, format)} />
                  </>
                ) : report.key === "unpaid" ? (
                  <>
                    <ReportMetric label={t("financialReports.metric.invoiceCount")} value={metric(totals?.invoice_count, summaries.isLoading)} />
                    <ReportMetric label={t("financialReports.metric.outstanding")} value={money(totals?.outstanding, summaries.isLoading, format)} />
                    <ReportMetric label={t("financialReports.metric.overdue")} value={money(totals?.overdue, summaries.isLoading, format)} />
                  </>
                ) : (
                  <>
                    <ReportMetric label={t("financialReports.metric.invoiceCount")} value={metric(totals?.invoice_count, summaries.isLoading)} />
                    <ReportMetric label={t("financialReports.metric.billed")} value={money(totals?.billed, summaries.isLoading, format)} />
                    <ReportMetric label={t("financialReports.metric.collected")} value={money(totals?.collected, summaries.isLoading, format)} />
                    <ReportMetric label={t("financialReports.metric.outstanding")} value={money(totals?.outstanding, summaries.isLoading, format)} />
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-h-20 border-b border-r px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-sm font-semibold tabular-nums">{value}</p></div>;
}

function metric(value: number | undefined, loading: boolean): string {
  if (loading) return "...";
  return String(value ?? 0);
}

function money(value: string | undefined, loading: boolean, format: ReturnType<typeof useFormatter>): string {
  if (loading) return "...";
  return format.number(Number(value ?? 0), { style: "currency", currency: "MYR" });
}

function reportColumns(t: ReturnType<typeof useTranslations<"billing">>) {
  const states: InvoiceState[] = ["DRAFT", "ISSUED", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED", "WRITTEN_OFF"];
  return [
    { key: "invoice_no", label: t("field.invoiceNumber") },
    { key: "company_name", label: t("field.company") },
    { key: "kind", label: t("field.kind"), values: { SAAS: t("kind.SAAS"), COMMISSION: t("kind.COMMISSION") } },
    { key: "period_start", label: t("field.periodStart") },
    { key: "period_end", label: t("field.periodEnd") },
    { key: "total_amount", label: t("field.receivable") },
    { key: "amount_paid", label: t("field.received") },
    { key: "amount_outstanding", label: t("field.outstanding") },
    { key: "due_on", label: t("field.dueDate") },
    { key: "state", label: t("field.state"), values: Object.fromEntries(states.map((state) => [state, t(`state.${state}`)])) },
  ];
}

function paymentColumns(t: ReturnType<typeof useTranslations<"billing">>) {
  return [
    { key: "invoice_no", label: t("field.invoiceNumber") },
    { key: "company_name", label: t("field.company") },
    { key: "amount", label: t("field.received") },
    { key: "paid_on", label: t("field.paidOn") },
    { key: "method", label: t("field.method") },
    { key: "reference", label: t("field.reference") },
    { key: "state", label: t("field.state") },
  ];
}
