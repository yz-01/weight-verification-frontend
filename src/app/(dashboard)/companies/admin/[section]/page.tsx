import { redirect } from "next/navigation";

import {
  CompanyManagementWorkspace,
  type CompanyAdminSection,
} from "@/components/companies/company-management-workspace";

const COMPANY_ADMIN_SECTIONS = new Set<CompanyAdminSection>([
  "directory",
  "review",
  "projects",
  "recyclers",
]);

export default async function CompanyManagementSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "subscriptions") redirect("/subscriptions/companies");
  if (section === "activity") redirect("/audit-logs/search?category=COMPANY");
  if (!COMPANY_ADMIN_SECTIONS.has(section as CompanyAdminSection)) {
    redirect("/companies/admin/directory");
  }
  return <CompanyManagementWorkspace section={section as CompanyAdminSection} />;
}
