import { BillingWorkspace, type BillingSection } from "@/components/billing/billing-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<BillingSection>(["automatic-billing", "collections", "payment-proofs", "commission-rules", "search", "reports"]);

export default async function BillingSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "saas-invoices") redirect("/billing/search?kind=SAAS");
  if (section === "commission") redirect("/billing/search?kind=COMMISSION");
  if (section === "statistics") redirect("/billing/search");
  if (section === "activity") redirect("/audit-logs/search?category=BILLING");
  return <BillingWorkspace section={SECTIONS.has(section as BillingSection) ? section as BillingSection : "overview"} />;
}
