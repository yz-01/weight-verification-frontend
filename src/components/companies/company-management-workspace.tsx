"use client";

import { useTranslations } from "next-intl";

import { AuditLogs } from "@/components/audit/audit-logs";
import {
  Companies,
  type CompanyManagementSection,
} from "@/components/companies/companies";

export type CompanyAdminSection = CompanyManagementSection | "activity";

const SECTIONS = new Set<CompanyAdminSection>([
  "directory",
  "review",
  "status",
  "subscriptions",
  "projects",
  "recyclers",
  "search",
  "statistics",
  "activity",
]);

export function isCompanyAdminSection(
  value: string,
): value is CompanyAdminSection {
  return SECTIONS.has(value as CompanyAdminSection);
}

export function CompanyManagementWorkspace({
  section,
}: {
  section: CompanyAdminSection;
}) {
  const t = useTranslations("companies");
  if (section === "activity") {
    return (
      <AuditLogs
        fixedCategory="COMPANY"
        title={t("module.activity.title")}
        subtitle={t("module.activity.subtitle")}
      />
    );
  }
  return <Companies section={section} />;
}
