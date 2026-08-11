import { redirect } from "next/navigation";

import {
  UserManagementWorkspace,
  type UserAdminSection,
} from "@/components/users/user-management-workspace";

const USER_ADMIN_SECTIONS = new Set<UserAdminSection>([
  "management",
]);

export default async function UserManagementSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "activity") redirect("/audit-logs/search?category=USER");
  if (!USER_ADMIN_SECTIONS.has(section as UserAdminSection)) {
    redirect("/users/admin/management");
  }
  return <UserManagementWorkspace section={section as UserAdminSection} />;
}
