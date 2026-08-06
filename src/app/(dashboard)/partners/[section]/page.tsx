import { PartnerManagementWorkspace, type PartnerSection } from "@/components/partners/partner-management-workspace";

const SECTIONS = new Set<PartnerSection>(["management", "details", "types", "territories", "customers", "agreements", "schemes", "performance", "reports", "activity"]);

export default async function PartnerSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <PartnerManagementWorkspace section={SECTIONS.has(section as PartnerSection) ? section as PartnerSection : "overview"} />;
}
