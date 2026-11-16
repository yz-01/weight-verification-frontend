import { SalesAdminWorkspace, type SalesAdminSection } from "@/components/sales/sales-admin-workspace";
import { redirect } from "next/navigation";
// JB209-17 (Lucas 11-16: 「做一个设置画面」, reverses D-083 for sales only):
// 销售区域 is its own page again instead of a redirect to the partners' areas.
const SECTIONS = new Set<SalesAdminSection>(["people", "territories", "hierarchy", "assignments", "rules", "schemes", "terms", "payouts", "performance", "settlements", "reports"]);
export default async function SalesSectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params;
  if (section === "details") redirect("/sales/people"); if (section === "activity") redirect("/audit-logs/search?category=SALES"); return <SalesAdminWorkspace section={SECTIONS.has(section as SalesAdminSection) ? section as SalesAdminSection : "overview"} />; }
