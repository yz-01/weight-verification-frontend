import { CustomerServiceWorkspace, type CustomerServiceSection } from "@/components/crm/customer-service-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<CustomerServiceSection>(["customers", "enquiries", "training", "visits", "feedback", "service", "reports"]);

export default async function CustomerServiceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "activity") redirect("/audit-logs/search?category=CUSTOMER_SERVICE");
  return <CustomerServiceWorkspace section={SECTIONS.has(section as CustomerServiceSection) ? section as CustomerServiceSection : "overview"} />;
}
