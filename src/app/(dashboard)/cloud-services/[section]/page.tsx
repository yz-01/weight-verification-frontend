import { CloudServiceManagementWorkspace, type CloudSection } from "@/components/cloud-services/cloud-service-management-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<CloudSection>(["services", "catalog", "vendors", "plans", "usage", "costs", "pricing", "alerts", "analysis", "reports"]);

export default async function CloudSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "activity") redirect("/audit-logs/search?category=CLOUD_SERVICE");
  return <CloudServiceManagementWorkspace section={SECTIONS.has(section as CloudSection) ? section as CloudSection : "overview"} />;
}
