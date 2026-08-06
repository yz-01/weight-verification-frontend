import {
  AdminReportWorkspace,
  type AdminReportSection,
} from "@/components/reports/admin-report-workspace";

const SECTIONS = new Set<AdminReportSection>([
  "contractors",
  "recyclers",
  "business",
  "saas",
  "commission",
  "cwe",
  "operations",
  "search",
  "export",
  "history",
]);

export default async function AdminReportSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return (
    <AdminReportWorkspace
      section={
        SECTIONS.has(section as AdminReportSection)
          ? (section as AdminReportSection)
          : "overview"
      }
    />
  );
}
