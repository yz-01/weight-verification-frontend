"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Settings2,
  WalletCards,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { AuditLogs } from "@/components/audit/audit-logs";
import { AutomaticBilling } from "@/components/billing/automatic-billing";
import { CommissionRuleManager } from "@/components/billing/commission-rule-manager";
import { FinancialReports } from "@/components/billing/financial-reports";
import { InvoiceList } from "@/components/billing/invoice-list";
import { PaymentManager } from "@/components/billing/payment-manager";
import { ListHeader } from "@/components/shared/page-primitives";
import { getBillingSummary } from "@/services/billing.service";

export type BillingSection =
  | "overview"
  | "saas-invoices"
  | "commission"
  | "automatic-billing"
  | "collections"
  | "payment-proofs"
  | "commission-rules"
  | "search"
  | "statistics"
  | "reports"
  | "activity";

const SUBMODULES: Array<{ section: Exclude<BillingSection, "overview">; number: string }> = [
  { section: "saas-invoices", number: "5.2.1" }, { section: "commission", number: "5.2.2" },
  { section: "automatic-billing", number: "5.2.3" }, { section: "collections", number: "5.2.4" },
  { section: "payment-proofs", number: "5.2.5" }, { section: "commission-rules", number: "5.2.6" },
  { section: "search", number: "5.2.7" }, { section: "statistics", number: "5.2.8" },
  { section: "reports", number: "5.2.9" }, { section: "activity", number: "5.2.10" },
];

export function BillingWorkspace({ section = "overview" }: { section?: BillingSection }) {
  const t = useTranslations("billing");
  const summary = useQuery({ queryKey: ["billing", "summary"], queryFn: getBillingSummary });
  if (section === "activity") {
    return (
      <AuditLogs
        fixedCategory="BILLING"
        advanced
        showExport
        title={t("section.activity.title")}
        subtitle={t("section.activity.subtitle")}
      />
    );
  }

  let content: React.ReactNode;
  if (section === "overview") content = <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm"><div className="grid md:grid-cols-2 xl:grid-cols-3">{SUBMODULES.map((module) => <Link key={module.section} href={`/billing/${module.section}`} className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"><span className="min-w-0 flex-1 font-medium">{t(`section.${module.section}.title`)}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div></div>;
  else if (section === "saas-invoices") content = <InvoiceList fixedKind="SAAS" embedded />;
  else if (section === "commission") content = <InvoiceList fixedKind="COMMISSION" embedded />;
  else if (section === "automatic-billing") content = <AutomaticBilling />;
  else if (section === "collections") content = <PaymentManager />;
  else if (section === "payment-proofs") content = <PaymentManager proofsOnly />;
  else if (section === "commission-rules") content = <CommissionRuleManager />;
  else if (section === "statistics") content = <BillingMetrics expanded />;
  else if (section === "reports") content = <FinancialReports />;
  else content = <InvoiceList embedded />;

  return <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4"><ListHeader title={section === "overview" ? t("title") : t(`section.${section}.title`)} subtitle={section === "overview" ? t("subtitle") : t(`section.${section}.subtitle`)} /><BillingWorkflow section={section} />{section === "overview" && <Summary data={summary.data} loading={summary.isLoading} />}{content}</div>;
}

const WORKFLOW_STEPS = [
  { key: "rules", href: "/billing/commission-rules" },
  { key: "generate", href: "/billing/automatic-billing" },
  { key: "issue", href: "/billing/search?state=DRAFT" },
  { key: "collect", href: "/billing/collections" },
  { key: "report", href: "/billing/reports" },
] as const;

function BillingWorkflow({ section }: { section: BillingSection }) {
  const t = useTranslations("billing");
  const activeStep = section === "commission-rules"
    ? "rules"
    : ["automatic-billing"].includes(section)
      ? "generate"
      : ["search", "saas-invoices", "commission"].includes(section)
        ? "issue"
      : ["collections", "payment-proofs"].includes(section)
        ? "collect"
        : ["statistics", "reports", "activity"].includes(section)
          ? "report"
          : undefined;
  const icons = {
    rules: Settings2,
    generate: FileText,
    issue: CheckCircle2,
    collect: WalletCards,
    report: CircleDollarSign,
  };

  return (
    <section className="shrink-0 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.035]">
      <div className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t("workflow.title")}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {t("workflow.description")}
          </p>
        </div>
        <span className="mt-1 text-xs font-medium text-primary sm:mt-0">
          {t("workflow.notDuplicate")}
        </span>
      </div>
      <div className="overflow-x-auto bg-background/60">
        <div className="grid min-w-[760px] divide-x sm:min-w-0 sm:grid-cols-5">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = icons[step.key];
          const active = activeStep === step.key;
          return (
            <Link
              key={step.key}
              href={step.href}
              aria-current={active ? "step" : undefined}
              className={`flex min-h-16 items-center gap-2.5 px-4 py-3 transition-colors hover:bg-primary/[0.06] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? "bg-primary/[0.08] text-primary" : ""}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-md ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">{t("workflow.stepLabel", { number: index + 1 })}</p>
                <p className="text-xs font-semibold leading-5">{t(`workflow.step.${step.key}`)}</p>
              </div>
            </Link>
          );
        })}
        </div>
      </div>
      <div className="grid border-t text-xs sm:grid-cols-2 sm:divide-x">
        <p className="px-4 py-2.5 leading-5"><strong>{t("workflow.saas.title")}</strong> {t("workflow.saas.description")}</p>
        <p className="border-t px-4 py-2.5 leading-5 sm:border-t-0"><strong>{t("workflow.commission.title")}</strong> {t("workflow.commission.description")}</p>
      </div>
    </section>
  );
}

function BillingMetrics({ expanded = false }: { expanded?: boolean }) {
  const summary = useQuery({ queryKey: ["billing", "summary"], queryFn: getBillingSummary });
  return <div className="overflow-hidden rounded-lg border bg-card shadow-sm"><Summary data={summary.data} loading={summary.isLoading} expanded={expanded} /></div>;
}

function Summary({ data, loading, expanded = false }: { data: Awaited<ReturnType<typeof getBillingSummary>> | undefined; loading: boolean; expanded?: boolean }) {
  const t = useTranslations("billing"); const format = useFormatter();
  const money = (value?: string) => value === undefined ? "..." : format.number(Number(value), { style: "currency", currency: "MYR" });
  const metrics = [
    ["saasBilled", money(data?.saas.billed)], ["saasCollected", money(data?.saas.collected)], ["saasOutstanding", money(data?.saas.outstanding)],
    ["commissionBilled", money(data?.commission.billed)], ["commissionCollected", money(data?.commission.collected)], ["commissionOutstanding", money(data?.commission.outstanding)],
    ["pendingReviews", loading ? "..." : data?.pending_payment_review ?? 0], ["overdue", money(String(Number(data?.saas.overdue ?? 0) + Number(data?.commission.overdue ?? 0)))],
  ] as const;
  const visible = expanded ? metrics : metrics.slice(0, 6);
  return <div className={`grid border-l ${expanded ? "sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>{visible.map(([key, value]) => <div key={key} className="min-h-20 border-b border-r px-4 py-3"><p className="text-xs text-muted-foreground">{t(`metric.${key}`)}</p><p className="mt-2 text-lg font-semibold tabular-nums">{value}</p></div>)}</div>;
}
