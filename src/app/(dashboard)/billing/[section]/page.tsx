import { BillingWorkspace, type BillingSection } from "@/components/billing/billing-workspace";

const SECTIONS = new Set<BillingSection>(["saas-invoices", "commission", "automatic-billing", "collections", "payment-proofs", "commission-rules", "search", "statistics", "reports", "activity"]);

export default async function BillingSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <BillingWorkspace section={SECTIONS.has(section as BillingSection) ? section as BillingSection : "overview"} />;
}
