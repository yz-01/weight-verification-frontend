import {
  AuditCenterWorkspace,
  type AuditCenterSection,
} from "@/components/audit/audit-center-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<AuditCenterSection>([
  "login", "search", "immutable",
]);

export default async function AuditCenterSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const categoryBySection: Record<string, string> = {
    users: "USER",
    companies: "COMPANY",
    subscriptions: "SUBSCRIPTION",
    billing: "BILLING",
    cwe: "CWE",
    settings: "SETTINGS",
  };
  if (categoryBySection[section]) {
    redirect(`/audit-logs/search?category=${categoryBySection[section]}`);
  }
  if (section === "export") redirect("/audit-logs/search");
  return (
    <AuditCenterWorkspace
      section={SECTIONS.has(section as AuditCenterSection)
        ? (section as AuditCenterSection)
        : "overview"}
    />
  );
}
