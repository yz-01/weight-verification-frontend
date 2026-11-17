/**
 * The package rules the screens share (JB213, Lucas 11-16 「把它们真的做出来」).
 *
 * The server decides each of these; the screens only pre-fill and explain, so
 * the arithmetic here mirrors `companies` on the backend:
 * - 付款周期 is the default term (月 1 / 季 3 / 半年 6 / 年 12);
 * - a 试用天数 trial runs from the start day for that many days, and 续期
 *   starts the paid term the day after it (or today, once it has ended);
 * - an empty 功能 list is every feature, and a list with no key the screen
 *   knows counts as empty too;
 * - a hidden (不公开) or stopped package leaves the pickers, except for the
 *   company already on it.
 */

import { BILLING_CYCLE_MONTHS, type BillingCycle, type CompanyType } from "@/interfaces/subscription";

/** Months in one 付款周期; an unknown cycle counts as one month, as the server does. */
export function cycleMonths(cycle: string | null | undefined): number {
  return BILLING_CYCLE_MONTHS[cycle as BillingCycle] ?? 1;
}

/**
 * One bill of a package on its own 付款周期 (JB213 walk 11-17: 「MYR 300.00
 * 每月」 on a 季付 package left an older reader guessing what one bill is).
 *
 * Priced exactly as `generate_saas_invoice` prices a term: 12 months or more
 * is the yearly fee per year when the package has one, otherwise the monthly
 * fee times the months. `null` for a monthly package (its bill is the monthly
 * fee, already on screen) and when there is nothing to bill, as the server
 * then raises no bill either.
 */
export function cycleBill(plan: {
  billing_cycle: string | null | undefined;
  monthly_fee: string | null | undefined;
  yearly_fee: string | null | undefined;
}): { months: number; amount: string } | null {
  const months = cycleMonths(plan.billing_cycle);
  if (months <= 1) return null;
  // Whole cents, so 3 × 0.10 is 0.30 and not 0.30000000000000004.
  const cents = (value: string | null | undefined) => Math.round(Number(value || 0) * 100);
  const yearly = cents(plan.yearly_fee);
  const total =
    months >= 12 && yearly > 0
      ? Math.round((yearly * months) / 12)
      : cents(plan.monthly_fee) * months;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { months, amount: (total / 100).toFixed(2) };
}

/** `iso` moved by `days` calendar days (UTC arithmetic, so no DST slip). */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

/** The trial's last free day, or `null` when there is no trial. */
export function trialEndsOn(startIso: string, days: number): string | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  return addDays(startIso, Math.floor(days) - 1);
}

/** Where 续期 starts the first paid term of a company still on its trial. */
export function paidTermStart(trialEnd: string, today: string): string {
  const afterTrial = addDays(trialEnd, 1);
  return afterTrial > today ? afterTrial : today;
}

/**
 * Split a stored 功能 list into what the checklist shows ticked and what it
 * cannot show: keys typed as free text before the list became a checklist.
 * Those are kept as they are (11-05 事项 4 第 8 点), never silently dropped.
 */
export function featureListParts(stored: readonly string[], choices: readonly string[]) {
  const known = new Set(choices);
  return {
    checked: stored.filter((key) => known.has(key)),
    legacy: stored.filter((key) => !known.has(key)),
  };
}

/** True when the list limits nothing: empty, or nothing in it is a menu. */
export function featureListIsOpen(stored: readonly string[], choices: readonly string[]): boolean {
  return featureListParts(stored, choices).checked.length === 0;
}

/**
 * Tick or untick one menu. The result keeps the checklist's own order, then
 * any legacy keys exactly as they were.
 */
export function toggleFeature(
  stored: readonly string[],
  key: string,
  on: boolean,
  choices: readonly string[],
): string[] {
  const { checked, legacy } = featureListParts(stored, choices);
  const ticked = new Set(checked);
  if (on) ticked.add(key);
  else ticked.delete(key);
  return [...choices.filter((choice) => ticked.has(choice)), ...legacy];
}

interface PickablePlan {
  id: string;
  audience: CompanyType;
  is_active: boolean;
  is_public: boolean;
  is_default?: boolean;
}

/**
 * The packages a picker offers one company: active and public ones of its
 * audience, plus the one it is already on even when hidden or stopped (4g).
 */
export function pickerPlans<T extends PickablePlan>(
  plans: readonly T[],
  audience: CompanyType | "" | undefined,
  currentPlanId?: string | null,
): T[] {
  return plans.filter(
    (plan) =>
      plan.audience === audience &&
      ((plan.is_active && plan.is_public) || plan.id === currentPlanId),
  );
}

/**
 * The package 新增公司 pre-selects: the 11.2.2 默认配套 for a contractor.
 * A recycler is never given a guessed package (合作版 and 标准版 owe
 * different things), so nothing is pre-selected for one.
 */
export function defaultPlanId<T extends PickablePlan>(
  plans: readonly T[],
  audience: CompanyType | "" | undefined,
): string {
  if (audience !== "CONTRACTOR") return "";
  return plans.find((plan) => plan.audience === audience && plan.is_default)?.id ?? "";
}

/**
 * Whether a connection's switch may be pressed: switching off always,
 * switching on only when the package includes 外部接口 for an outbound kind
 * (JB213, 4f). One already on and outside the package keeps running.
 */
export function canSwitchOn(row: { is_enabled: boolean; outside_plan?: boolean }): boolean {
  return row.is_enabled || !row.outside_plan;
}
