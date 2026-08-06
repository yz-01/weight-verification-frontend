import { AssetManagementWorkspace, type AssetSection } from "@/components/assets/asset-management-workspace";

const SECTIONS = new Set<AssetSection>(["management", "details", "categories", "purchases", "inventory", "assignments", "installations", "transfers", "repairs", "maintenance", "disposals", "search", "reports", "activity"]);

export default async function AssetSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <AssetManagementWorkspace section={SECTIONS.has(section as AssetSection) ? section as AssetSection : "overview"} />;
}
