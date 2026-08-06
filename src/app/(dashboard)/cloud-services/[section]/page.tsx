import { CloudServiceManagementWorkspace, type CloudSection } from "@/components/cloud-services/cloud-service-management-workspace";

const SECTIONS = new Set<CloudSection>(["services", "catalog", "vendors", "plans", "usage", "costs", "pricing", "alerts", "analysis", "reports", "activity"]);

export default async function CloudSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <CloudServiceManagementWorkspace section={SECTIONS.has(section as CloudSection) ? section as CloudSection : "overview"} />;
}
