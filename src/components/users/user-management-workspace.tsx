import { Users, type UserManagementSection } from "@/components/users/users";

export type UserAdminSection = UserManagementSection;

const SECTIONS = new Set<UserAdminSection>([
  "management",
]);

export function isUserAdminSection(value: string): value is UserAdminSection {
  return SECTIONS.has(value as UserAdminSection);
}

export function UserManagementWorkspace({
  section,
}: {
  section: UserAdminSection;
}) {
  return <Users section={section} />;
}
