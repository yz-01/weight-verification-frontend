"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AuditLogs } from "@/components/audit/audit-logs";
import { LoginRecords } from "@/components/audit/login-records";
import { ListHeader } from "@/components/shared/page-primitives";

export type AuditCenterSection =
  | "overview"
  | "users"
  | "companies"
  | "subscriptions"
  | "billing"
  | "cwe"
  | "settings"
  | "login"
  | "search"
  | "export"
  | "immutable";

const SUBMODULES: Array<{
  section: Exclude<AuditCenterSection, "overview">;
  number: string;
  category?: string;
}> = [
  { section: "users", number: "12.2.1", category: "USER" },
  { section: "companies", number: "12.2.2", category: "COMPANY" },
  { section: "subscriptions", number: "12.2.3", category: "SUBSCRIPTION" },
  { section: "billing", number: "12.2.4", category: "BILLING" },
  { section: "cwe", number: "12.2.5", category: "CWE" },
  { section: "settings", number: "12.2.6", category: "SETTINGS" },
  { section: "login", number: "12.2.7" },
  { section: "search", number: "12.2.8" },
  { section: "export", number: "12.2.9" },
  { section: "immutable", number: "12.2.10" },
];

export function AuditCenterWorkspace({
  section = "overview",
}: {
  section?: AuditCenterSection;
}) {
  const t = useTranslations("adminAuditCenter");
  const current = SUBMODULES.find((item) => item.section === section);

  if (section === "login") return <LoginRecords />;
  if (section !== "overview") {
    return (
      <AuditLogs
        fixedCategory={current?.category}
        advanced={section === "search" || section === "export"}
        showExport={section === "export"}
        title={t(`section.${section}.title`)}
        subtitle={t(`section.${section}.subtitle`)}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="min-h-0 flex-1 overflow-y-auto border-y bg-card">
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {SUBMODULES.map((module) => (
            <Link
              key={module.section}
              href={`/audit-logs/${module.section}`}
              className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"
            >
              
              <span className="min-w-0 flex-1 font-medium">
                {t(`section.${module.section}.title`)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
