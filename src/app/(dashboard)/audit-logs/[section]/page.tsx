import {
  AuditCenterWorkspace,
  type AuditCenterSection,
} from "@/components/audit/audit-center-workspace";

const SECTIONS = new Set<AuditCenterSection>([
  "users", "companies", "subscriptions", "billing", "cwe", "settings",
  "login", "search", "export", "immutable",
]);

export default async function AuditCenterSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return (
    <AuditCenterWorkspace
      section={SECTIONS.has(section as AuditCenterSection)
        ? (section as AuditCenterSection)
        : "overview"}
    />
  );
}
