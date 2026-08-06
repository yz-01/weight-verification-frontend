"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { AuditLogs } from "@/components/audit/audit-logs";
import { CompanySubscriptions } from "@/components/subscriptions/company-subscriptions";
import { PlanManager } from "@/components/subscriptions/plan-manager";
import { RenewalQueue } from "@/components/subscriptions/renewal-queue";
import { ListHeader } from "@/components/shared/page-primitives";
import { getSubscriptionSummary } from "@/services/subscription.service";

export type SubscriptionSection =
  | "overview"
  | "plans"
  | "companies"
  | "status"
  | "package-changes"
  | "account-limits"
  | "reminders"
  | "search"
  | "statistics"
  | "activity";

const SUBMODULES: Array<{ section: Exclude<SubscriptionSection, "overview">; number: string }> = [
  { section: "plans", number: "4.2.1" },
  { section: "companies", number: "4.2.2" },
  { section: "status", number: "4.2.3" },
  { section: "package-changes", number: "4.2.4" },
  { section: "account-limits", number: "4.2.5" },
  { section: "reminders", number: "4.2.6" },
  { section: "search", number: "4.2.7" },
  { section: "statistics", number: "4.2.8" },
  { section: "activity", number: "4.2.9" },
];

export function SubscriptionList({ section = "overview" }: { section?: SubscriptionSection }) {
  const t = useTranslations("subscriptions");
  const summary = useQuery({
    queryKey: ["subscriptions", "summary"],
    queryFn: getSubscriptionSummary,
  });

  if (section === "activity") {
    return (
      <AuditLogs
        fixedAction="BILLING_CHANGE"
        title={t("section.activity.title")}
        subtitle={t("section.activity.subtitle")}
      />
    );
  }

  const content = (() => {
    if (section === "plans") return <PlanManager />;
    if (section === "reminders") return <RenewalQueue />;
    if (section === "statistics") return <SubscriptionMetrics />;
    if (section === "overview") {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto border-y bg-card">
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            {SUBMODULES.map((module) => (
              <Link
                key={module.section}
                href={`/subscriptions/${module.section}`}
                className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"
              >
                
                <span className="min-w-0 flex-1 font-medium">{t(`section.${module.section}.title`)}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      );
    }
    return <CompanySubscriptions />;
  })();

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={section === "overview" ? t("title") : t(`section.${section}.title`)}
        subtitle={section === "overview" ? t("subtitle") : t(`section.${section}.subtitle`)}
      />
      {section === "overview" && (
        <SummaryStrip data={summary.data} loading={summary.isLoading} />
      )}
      {content}
    </div>
  );
}

function SubscriptionMetrics() {
  const summary = useQuery({
    queryKey: ["subscriptions", "summary"],
    queryFn: getSubscriptionSummary,
  });
  return <div className="border-y bg-card"><SummaryStrip data={summary.data} loading={summary.isLoading} expanded /></div>;
}

function SummaryStrip({
  data,
  loading,
  expanded = false,
}: {
  data: Awaited<ReturnType<typeof getSubscriptionSummary>> | undefined;
  loading: boolean;
  expanded?: boolean;
}) {
  const t = useTranslations("subscriptions");
  const format = useFormatter();
  const metrics = [
    ["active", data?.active],
    ["expiring", data?.expiring_soon],
    ["expired", data?.expired],
    ["notStarted", data?.not_started],
    ["paused", data?.paused],
    ["newThisMonth", data?.started_this_month],
    ["renewedThisMonth", data?.renewed_this_month],
    ["monthlyRevenue", data ? format.number(Number(data.monthly_revenue), { style: "currency", currency: "MYR" }) : undefined],
  ] as const;
  const visible = expanded ? metrics : metrics.slice(0, 6);
  return (
    <div className={`grid border-l ${expanded ? "sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>
      {visible.map(([key, value]) => (
        <div key={key} className="min-h-20 border-b border-r px-4 py-3">
          <p className="text-xs text-muted-foreground">{t(`metric.${key}`)}</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{loading ? "..." : value ?? 0}</p>
        </div>
      ))}
    </div>
  );
}
