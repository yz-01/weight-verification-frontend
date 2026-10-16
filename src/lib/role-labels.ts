/**
 * Naming a role in the reader's language.
 *
 * Roles seeded from the platform's templates carry an English name and
 * description in the database, because the seeder has no reader to write for.
 * Those are fallbacks: the real label lives in the message catalogue under the
 * role's code, so a Malay-speaking site crew sees "Kakitangan Tapak" rather
 * than "Site Staff".
 *
 * Roles a tenant wrote themselves have no catalogue entry and keep whatever
 * they were named, which is correct: nobody can translate a name the platform
 * has never seen.
 *
 * Note this deliberately keys off the role's code rather than its `is_system`
 * flag. That flag means "cannot be deleted", which is true of only the admin
 * roles, while every seeded role has a translation. Conflating the two left
 * Finance and Support Agent showing English inside a Chinese interface.
 */

import { useTranslations } from "next-intl";

import type { Role } from "@/interfaces/auth";

type Translate = ReturnType<typeof useTranslations>;

export function roleName(role: Pick<Role, "code" | "name">, t: Translate): string {
  const key = `roles.system_.${role.code}`;
  return t.has(key) ? t(key) : role.name;
}

export function roleDescription(
  role: Pick<Role, "code" | "description">,
  t: Translate,
): string {
  const key = `roles.systemDescription.${role.code}`;
  return t.has(key) ? t(key) : role.description;
}

/**
 * A role named on someone else's row - the user table, the project team
 * picker, a permit's approver list - where only its code and stored name
 * travel with the person. Same rule as `roleName`.
 */
export function roleLabel(
  code: string | null | undefined,
  name: string | null | undefined,
  t: Translate,
): string {
  const stored = name ?? "";
  const resolved = code || SEEDED_ROLE_CODE_BY_NAME[stored];
  if (!resolved) return stored;
  return roleName({ code: resolved, name: stored }, t);
}

/**
 * Some payloads (the signed-in user, a gate record's members) carry only the
 * stored role name. Seeded roles keep the platform's English template name, so
 * that name identifies the preset. A tenant role with a different name is left
 * alone. Prefer passing the code whenever the API sends it.
 */
export const SEEDED_ROLE_CODE_BY_NAME: Record<string, string> = {
  "Platform Administrator": "platform_admin",
  "Support Agent": "platform_support",
  "Company Administrator": "company_admin",
  "Site Staff": "site_staff",
  "Project Manager": "project_manager",
  Headquarters: "headquarters",
  "Gate Guard": "gate_guard",
  Viewer: "viewer",
  "Safety Manager": "safety_manager",
  "Quantity Surveyor (QS)": "quantity_surveyor",
  Storekeeper: "storekeeper",
  "Equipment Manager": "equipment_manager",
  "Site Supervisor": "site_supervisor",
  Finance: "finance",
  "Document Controller": "document_controller",
  Dispatcher: "dispatcher",
  "Weighbridge Operator": "weighbridge_operator",
  Driver: "driver",
};

/** Hook form of `roleLabel` for components that only need to show a name. */
export function useRoleLabel() {
  const t = useTranslations();
  return (code: string | null | undefined, name: string | null | undefined) =>
    roleLabel(code, name, t);
}
