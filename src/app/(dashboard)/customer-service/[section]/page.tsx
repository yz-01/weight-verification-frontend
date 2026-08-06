import { CustomerServiceWorkspace, type CustomerServiceSection } from "@/components/crm/customer-service-workspace";

const SECTIONS = new Set<CustomerServiceSection>(["customers", "enquiries", "training", "visits", "feedback", "service", "reports", "activity"]);

export default async function CustomerServiceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <CustomerServiceWorkspace section={SECTIONS.has(section as CustomerServiceSection) ? section as CustomerServiceSection : "overview"} />;
}
