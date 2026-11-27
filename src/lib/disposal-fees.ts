/**
 * JB287 (客户 11-27): the plain rules the 清运费用 / 清运结算 screens share.
 *
 * - who is offered 清运费用设定, 确认核对 and 准备结算 / 结算完毕: an office
 *   account with the permission (the phone never: `sign_off_office_only`);
 * - an amount as the screens write it, 「RM 1,250.00」, and a dash when the
 *   reader may not see amounts (the server sends null);
 * - the ticked rows' sum, in cents, so 0.1 + 0.2 never shows 0.30000004;
 * - whether a set of ticked rows is one project and one supplier;
 * - the lock once a job is in a settlement (「车次和金额不能再改」).
 */
import type { DisposalFeeState, DisposalRequest } from "@/interfaces/contractor-ops";

/**
 * The permission behind 清运费用设定 and 清运结算 (decision 9: as JB278 did,
 * the module's own 「审核及安排垃圾清运」).
 */
export const DISPOSAL_SETTLE_PERMISSION = "disposal.manage";

/** The sign-off PIN's operation for 结算完毕 (`core.step_up.ACTIONS`). */
export const DISPOSAL_SETTLE_PIN_ACTION = "disposal_settlement.settle";

/** 清运费用设定 / 核对 / 结算: office only, with the permission. */
export function mayHandleDisposalFees(
  user: { is_field_staff?: boolean } | null | undefined,
  can: (code: string) => boolean,
): boolean {
  return Boolean(user) && !user?.is_field_staff && can(DISPOSAL_SETTLE_PERMISSION);
}

/** 「1,250.00」; the value as it came when it is not a number. */
export function moneyText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 「RM 1,250.00」, or 「—」 when hidden or empty. */
export function rmText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `RM ${moneyText(value)}`;
}

/** A fee as typed: above zero, at most two decimals. */
export function isValidFee(value: string): boolean {
  const text = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return false;
  return Number(text) > 0;
}

function cents(value: string | null | undefined): number {
  if (!value) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

/** The amounts added up, two decimals, or null when any is hidden. */
export function sumAmounts(values: readonly (string | null | undefined)[]): string | null {
  if (values.some((value) => value === null)) return null;
  const total = values.reduce((sum, value) => sum + cents(value), 0);
  return (total / 100).toFixed(2);
}

/** 「一次只能核对同一个项目、同一个供应商的清运记录」 holds for these rows. */
export function sameProjectAndSupplier(
  rows: readonly { project: { id: string }; supplier: { id: string } }[],
): boolean {
  if (rows.length <= 1) return true;
  const [first] = rows;
  return rows.every((row) => row.project.id === first.project.id && row.supplier.id === first.supplier.id);
}

/** Each 结算状态's colour on the list and the panel. */
export function feeStateTone(state: DisposalFeeState): "neutral" | "positive" | "warning" | "danger" | "info" {
  switch (state) {
    case "settled":
      return "positive";
    case "ready":
      return "info";
    case "unchecked":
      return "warning";
    case "no_fee":
      return "danger";
    default:
      return "neutral";
  }
}

/**
 * The settlement that locks a job's lorries, count and supplier (decision
 * 8), or null. From 确认核对 on the server refuses `disposal_in_settlement`;
 * the page shows the reason in place of the button.
 */
export function settlementLock(row: Pick<DisposalRequest, "settlement">): { number: string } | null {
  return row.settlement ? { number: row.settlement.number } : null;
}

/** 清运结算管理's three lists, kept in the address as `?stage=`. */
export type SettlementStage = "unchecked" | "ready" | "settled";

export function settlementStageOf(value: string | null): SettlementStage {
  return value === "ready" || value === "settled" ? value : "unchecked";
}

/** 「去设定清运费用」: the 垃圾清运 page with the fee window open. */
export const DISPOSAL_FEES_HREF = "/waste-clearance?kind=garbage&fees=1";

/** Where a settlement opens, from the 垃圾清运 list or a record's panel. */
export function disposalSettlementHref(settlement: { id: string; status: "READY" | "SETTLED" }): string {
  const stage = settlement.status === "SETTLED" ? "settled" : "ready";
  return `/waste-clearance?kind=settlement&stage=${stage}&settlement=${settlement.id}`;
}
