import { notFound, redirect } from "next/navigation";

import {
  UserManagementWorkspace,
  type UserAdminSection,
} from "@/components/users/user-management-workspace";

const USER_ADMIN_SECTIONS = new Set<UserAdminSection>([
  "management",
  "profiles",
  "categories",
  "login",
  "statistics",
  "activity",
]);

export default async function UserManagementSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "search") {
    redirect("/users/admin/profiles");
  }
  if (!USER_ADMIN_SECTIONS.has(section as UserAdminSection)) {
    notFound();
  }
  return <UserManagementWorkspace section={section as UserAdminSection} />;
}
