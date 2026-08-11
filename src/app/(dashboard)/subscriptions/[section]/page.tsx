import {
  SubscriptionList,
  type SubscriptionSection,
} from "@/components/subscriptions/subscription-list";
import { redirect } from "next/navigation";

const SECTIONS = new Set<SubscriptionSection>([
  "plans",
  "companies",
  "reminders",
]);

export default async function SubscriptionSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "activity") {
    redirect("/audit-logs/search?category=SUBSCRIPTION");
  }
  if (["status", "package-changes", "account-limits", "search", "statistics"].includes(section)) {
    redirect("/subscriptions/companies");
  }
  return <SubscriptionList section={SECTIONS.has(section as SubscriptionSection) ? section as SubscriptionSection : "overview"} />;
}
