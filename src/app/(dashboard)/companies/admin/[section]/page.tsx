import { notFound } from "next/navigation";

import {
  CompanyManagementWorkspace,
  type CompanyAdminSection,
} from "@/components/companies/company-management-workspace";

const COMPANY_ADMIN_SECTIONS = new Set<CompanyAdminSection>([
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

export default async function CompanyManagementSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!COMPANY_ADMIN_SECTIONS.has(section as CompanyAdminSection)) {
    notFound();
  }
  return <CompanyManagementWorkspace section={section as CompanyAdminSection} />;
}
