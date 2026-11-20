/**
 * What the role list and card say about a role (JB219, 客户 11-18 事项 4 「更加
 * 简洁」): its type in the client's own two words, and how much it decides.
 *
 * A builder office role's people hold every project permission by default
 * (JB139), so counting its stored ticks said 「11 项权限」 for a role whose
 * people held ninety; what the role decides is its 总部权限 (A + B).
 */

import type { useTranslations } from "next-intl";

import { roleKindOf } from "@/components/roles/permission-matrix";
import type { Role } from "@/interfaces/auth";

type Translate = ReturnType<typeof useTranslations>;

/** 「总部角色」 / 「项目角色」 / 「手机账号」, or ``null`` outside a builder. */
export function roleTypeLabel(role: Role, t: Translate): string | null {
  switch (roleKindOf(role)) {
    case "head_office":
      return t("roles.kind.headOffice");
    case "project":
      return t("roles.kind.project");
    case "phone":
      return t("roles.kind.phone");
    default:
      return null;
  }
}

/** The 权限 badge: 「全部权限」 for 公司管理员, 「总部权限 N 项」 for a builder
 * office role, the plain count otherwise. */
export function rolePermissionSummary(role: Role, t: Translate): string {
  const kind = roleKindOf(role);
  if (role.is_system && kind === "head_office") return t("roles.allPermissions");
  if ((kind === "head_office" || kind === "project") && typeof role.hq_permission_count === "number") {
    return t("roles.hqCount", { count: role.hq_permission_count });
  }
  return t("roles.permissionCount", { count: role.permissions.length });
}
