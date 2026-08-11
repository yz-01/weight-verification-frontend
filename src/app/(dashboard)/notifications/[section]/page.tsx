import {
  AdminNotificationWorkspace,
  type AdminNotificationSection,
} from "@/components/notifications/admin-notification-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<AdminNotificationSection>([
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
  if (["contractors", "recyclers", "saas", "commission", "cwe", "system", "search"].includes(section)) {
    redirect("/notifications/manage");
  }
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
