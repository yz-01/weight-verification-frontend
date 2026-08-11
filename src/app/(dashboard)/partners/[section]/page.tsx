import { PartnerManagementWorkspace, type PartnerSection } from "@/components/partners/partner-management-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<PartnerSection>(["management", "types", "territories", "customers", "agreements", "schemes", "performance", "reports"]);

export default async function PartnerSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "details") redirect("/partners/management");
  if (section === "activity") redirect("/audit-logs/search?category=PARTNER");
  return <PartnerManagementWorkspace section={SECTIONS.has(section as PartnerSection) ? section as PartnerSection : "overview"} />;
}
