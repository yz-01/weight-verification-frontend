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

import type { useTranslations } from "next-intl";

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
