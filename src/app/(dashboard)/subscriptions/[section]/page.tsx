import {
  SubscriptionList,
  type SubscriptionSection,
} from "@/components/subscriptions/subscription-list";

const SECTIONS = new Set<SubscriptionSection>([
  "plans",
  "companies",
  "status",
  "package-changes",
  "account-limits",
  "reminders",
  "search",
  "statistics",
  "activity",
]);

export default async function SubscriptionSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return <SubscriptionList section={SECTIONS.has(section as SubscriptionSection) ? section as SubscriptionSection : "overview"} />;
}
