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

/**
 * Whether a seeded role still carries the name it was seeded with. A preset
 * the company renamed is its own role now (JB219, 客户 11-18 事项 4: 「由建筑公司
 * 自行创建及命名」): its own name and description show, as the backend's
 * ``core.step_up.role_label`` already does. Before, the preset's name showed
 * whatever the company typed.
 */
function keepsSeededName(role: Pick<Role, "code" | "name">): boolean {
  const seeded = SEEDED_NAME_BY_CODE[role.code];
  return !role.name || seeded === undefined || role.name === seeded;
}

export function roleName(role: Pick<Role, "code" | "name">, t: Translate): string {
  const key = `roles.system_.${role.code}`;
  return t.has(key) && keepsSeededName(role) ? t(key) : role.name;
}

export function roleDescription(
  role: Pick<Role, "code" | "description"> & Partial<Pick<Role, "name">>,
  t: Translate,
): string {
  const key = `roles.systemDescription.${role.code}`;
  const renamed = role.name !== undefined && !keepsSeededName({ code: role.code, name: role.name });
  return t.has(key) && !renamed ? t(key) : role.description;
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
 * A stamped 身份 / 职位 line - 「Site Staff」, 「Site Staff · Stores」 - with the
 * platform's own role names in the reader's language, the same rule as the
 * backend's `core.step_up.title_label` (walk 11-18: 「申请人 阿明 · Site
 * Staff」 on a Chinese permit, while its PDF's 审批记录 said 工地人员). A
 * department, a job title and a role the company named stay as typed.
 */
export function titleLabel(title: string | null | undefined, t: Translate): string {
  return (title ?? "")
    .split(" · ")
    .map((part) => roleLabel(null, part, t))
    .join(" · ");
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
  "Equipment Operator": "equipment_operator",
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

/** The other way round: the English name each preset was seeded with. */
const SEEDED_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(SEEDED_ROLE_CODE_BY_NAME).map(([name, code]) => [code, name]),
);

/** Hook form of `roleLabel` for components that only need to show a name. */
export function useRoleLabel() {
  const t = useTranslations();
  return (code: string | null | undefined, name: string | null | undefined) =>
    roleLabel(code, name, t);
}
