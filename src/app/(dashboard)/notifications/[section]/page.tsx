import {
  AdminNotificationWorkspace,
  type AdminNotificationSection,
} from "@/components/notifications/admin-notification-workspace";

const SECTIONS = new Set<AdminNotificationSection>([
  "contractors",
  "recyclers",
  "saas",
  "commission",
  "cwe",
  "system",
  "search",
  "manage",
  "channels",
  "records",
]);

export default async function AdminNotificationSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return (
    <AdminNotificationWorkspace
      section={
        SECTIONS.has(section as AdminNotificationSection)
          ? (section as AdminNotificationSection)
          : "overview"
      }
    />
  );
}
