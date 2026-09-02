import { AssetManagementWorkspace, type AssetSection } from "@/components/assets/asset-management-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<AssetSection>(["management", "categories", "purchases", "inventory", "assignments", "installations", "transfers", "departments", "repairs", "maintenance", "disposals", "reports"]);

export default async function AssetSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (["details", "search"].includes(section)) redirect("/assets/management");
  if (section === "activity") redirect("/audit-logs/search?category=ASSET");
  return <AssetManagementWorkspace section={SECTIONS.has(section as AssetSection) ? section as AssetSection : "overview"} />;
}
