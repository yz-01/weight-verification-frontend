import {
  Companies,
  type CompanyManagementSection,
} from "@/components/companies/companies";

export type CompanyAdminSection = CompanyManagementSection;

const SECTIONS = new Set<CompanyAdminSection>([
  "directory",
  "review",
  "projects",
  "recyclers",
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
  return <Companies section={section} />;
}
