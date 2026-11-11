"use client";

/**
 * Whether the reader sees money - 「金额查看」 (J17).
 *
 * With the switch off the server blanks every amount it sends and ignores the
 * ones it is sent (JB167), so a price input on a form is a box whose number
 * is never kept: the correction that only changed it is then 「没有改动」
 * (JB170, 客户 11-11 第四批 事项 1). Forms leave such inputs out for that
 * reader instead.
 *
 * The switch is the permission `finance.view_amounts`: a builder's
 * back-office account holds it unless it is switched off for that person.
 * Only such an account can have it off (the server's
 * `core.permission_switches.hides_amounts`); everybody else - MSE, a
 * consultant, a recycler, the phone - sees what it always saw.
 */

import { useAuth } from "@/components/providers/auth-provider";

/** The 「金额查看」 switch's permission code. */
export const AMOUNTS_PERMISSION = "finance.view_amounts";

export function useSeesAmounts(): boolean {
  const { user, can } = useAuth();
  if (!user || user.is_superuser) return true;
  const switchable =
    user.account_type === "TENANT" && user.company_type === "CONTRACTOR" && !user.is_field_staff;
  return !switchable || can(AMOUNTS_PERMISSION);
}
