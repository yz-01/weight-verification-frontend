"use client";

import { useTranslations } from "next-intl";

import { AuditLogs } from "@/components/audit/audit-logs";
import { Users, type UserManagementSection } from "@/components/users/users";

export type UserAdminSection = UserManagementSection | "activity";

const SECTIONS = new Set<UserAdminSection>([
  "management",
  "profiles",
  "categories",
  "search",
  "login",
  "statistics",
  "activity",
]);

export function isUserAdminSection(value: string): value is UserAdminSection {
  return SECTIONS.has(value as UserAdminSection);
}

export function UserManagementWorkspace({
  section,
}: {
  section: UserAdminSection;
}) {
  const t = useTranslations("users");
  if (section === "activity") {
    return (
      <AuditLogs
        fixedCategory="USER"
        title={t("module.activity.title")}
        subtitle={t("module.activity.subtitle")}
      />
    );
  }
  return <Users section={section} />;
}
