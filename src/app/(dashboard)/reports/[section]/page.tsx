import {
  AdminReportWorkspace,
  type AdminReportSection,
} from "@/components/reports/admin-report-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<AdminReportSection>([
  "search",
  "history",
]);

export default async function AdminReportSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (["contractors", "recyclers", "business", "saas", "commission", "cwe", "operations", "export"].includes(section)) {
    redirect("/reports/search");
  }
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
