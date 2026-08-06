import { SalesAdminWorkspace, type SalesAdminSection } from "@/components/sales/sales-admin-workspace";
const SECTIONS = new Set<SalesAdminSection>(["people", "details", "territories", "hierarchy", "assignments", "rules", "schemes", "terms", "payouts", "performance", "settlements", "reports", "activity"]);
export default async function SalesSectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <SalesAdminWorkspace section={SECTIONS.has(section as SalesAdminSection) ? section as SalesAdminSection : "overview"} />; }
