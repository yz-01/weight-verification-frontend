/**
 * JB306 (客户 11-28i): 「金额审批」「费用核对」「结算确认」 - one switch each, on
 * top of every module's own (server: `core/money_steps.py`). A button whose
 * step is switched off is greyed and says which switch, in the words of
 * 「用户 › 编辑 › 权限开关」.
 */
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";

export const MONEY_STEP_CODES = {
  approve: "finance.approve_amounts",
  check: "finance.check_costs",
  settle: "finance.confirm_settlement",
} as const;

export type MoneyStep = keyof typeof MONEY_STEP_CODES;

/** `{ off, reason }`: whether the account's switch for `step` is off, and the sentence to show. */
export function useMoneyStep(step: MoneyStep): { off: boolean; reason: string | undefined } {
  const { can } = useAuth();
  const t = useTranslations("jb306");
  const off = !can(MONEY_STEP_CODES[step]);
  return { off, reason: off ? t(`off.${step}`) : undefined };
}
