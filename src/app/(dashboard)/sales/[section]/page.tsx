import { SalesAdminWorkspace, type SalesAdminSection } from "@/components/sales/sales-admin-workspace";
import { redirect } from "next/navigation";
const SECTIONS = new Set<SalesAdminSection>(["people", "hierarchy", "assignments", "rules", "schemes", "terms", "payouts", "performance", "settlements", "reports"]);
export default async function SalesSectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; if (section === "territories") redirect("/partners/territories");
  if (section === "details") redirect("/sales/people"); if (section === "activity") redirect("/audit-logs/search?category=SALES"); return <SalesAdminWorkspace section={SECTIONS.has(section as SalesAdminSection) ? section as SalesAdminSection : "overview"} />; }
