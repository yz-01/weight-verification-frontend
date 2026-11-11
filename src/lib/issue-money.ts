/**
 * 材料领用的单价、金额 and the cost report's 采购单价 (JB171, 客户 11-11 晚上
 * 「第四批」事项 2), as plain decisions the screens draw and the tests pin.
 *
 * Money is the server's to hide: with 「金额查看」 off it sends `null` for every
 * price and amount (J17). So 「没有单价」 is said only where the server says
 * so (`priced === false`, or a report with money that has no priced delivery);
 * a hidden figure is a dash, never 「没有单价」 and never 0.
 */

import type { CorrectionLine } from "@/interfaces/record-correction";

/** What a money cell shows: the figure, 「没有单价」, or a dash (hidden / nothing). */
export type MoneyCell =
  | { kind: "money"; value: string }
  | { kind: "unpriced" }
  | { kind: "hidden" };

/**
 * 「按材料统计成本」's 采购单价 (JB171 A3): the price, 「平均」 beside it when
 * the price changed, 「没有单价」 with no priced delivery. `moneyHidden` is the
 * report's own: 采购成本 blanked while some deliveries are priced.
 */
export function purchaseUnitPrice(
  row: { unit_price?: string | null; unit_price_mixed?: boolean },
  moneyHidden: boolean,
): MoneyCell & { average?: boolean } {
  if (row.unit_price != null) return { kind: "money", value: row.unit_price, average: Boolean(row.unit_price_mixed) };
  return moneyHidden ? { kind: "hidden" } : { kind: "unpriced" };
}

/** Whether the cost report's money is blanked for this reader (金额查看 off). */
export function reportMoneyHidden(summary: { total_cost: string | null; priced_receipts: number }): boolean {
  return summary.total_cost === null && summary.priced_receipts > 0;
}

/** An issue line's 单价 or 金额 (list, detail, statement). */
export function issueMoney(value: string | null | undefined, priced: boolean | null | undefined): MoneyCell {
  if (priced === false) return { kind: "unpriced" };
  if (value != null && value !== "") return { kind: "money", value };
  return { kind: "hidden" };
}

/**
 * Whether this reader may see the 材料领用's money (and so 「批量预览 / 打印」).
 * Read off what the server sent: 总金额 is null without 金额查看, and a line's
 * `priced` is null then too. The phone never does.
 */
export function seesIssueMoney(
  isFieldStaff: boolean | undefined,
  totals: { amount_total: string | null } | undefined,
  rows: readonly { priced?: boolean | null }[],
): boolean {
  if (isFieldStaff) return false;
  if (totals && totals.amount_total !== null) return true;
  return rows.some((row) => row.priced === true || row.priced === false);
}

/** 「1. Diesel 180L」: the line's number, material and specification. */
export function lineName(line: Pick<CorrectionLine, "position" | "material_name" | "material_specification">): string {
  return `${line.position}. ${[line.material_name, line.material_specification].filter(Boolean).join(" ")}`;
}

/**
 * 金额 as the 改正 window works it out while the price is typed (JB171 B5):
 * the quantity taken once handed over, else the quantity applied for.
 * Null while the price is blank or not a number.
 */
export function lineAmount(
  line: Pick<CorrectionLine, "quantity" | "issued_quantity">,
  typedPrice: string,
): { quantity: string; requested: boolean; price: string; amount: string } | null {
  const price = Number(typedPrice.trim());
  if (!typedPrice.trim() || !Number.isFinite(price) || price <= 0) return null;
  const requested = line.issued_quantity === null || line.issued_quantity === "";
  const quantity = requested ? line.quantity : (line.issued_quantity as string);
  const count = Number(quantity);
  if (!Number.isFinite(count)) return null;
  // Cents, so 3 x 0.1 is 0.30 and not 0.30000000000000004.
  const cents = Math.round(count * Math.round(price * 100));
  return { quantity, requested, price: price.toFixed(2), amount: (cents / 100).toFixed(2) };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The statement's letterhead, read off what the server sent (JB162): the
 * company's name, its lines (address, SSM, contact) and logo, and the
 * project. Read in the letterhead's own words (`company_name`, `company_lines`,
 * `company_logo_url`, `project_code`, `project_name`) or the plainer `name`,
 * `lines`, `logo_url`, `code` - never pieced together from who is looking.
 */
export function statementLetterhead(statement: {
  company: Record<string, unknown> | null;
  project: Record<string, unknown> | string | null;
}): { name: string; lines: string[]; logo: string; project: string } {
  const company = statement.company ?? {};
  const linesValue = company.company_lines ?? company.lines;
  const lines = Array.isArray(linesValue) ? linesValue.filter((line): line is string => typeof line === "string" && line !== "") : [];
  const project = statement.project;
  let projectText = "";
  if (typeof project === "string") projectText = project;
  else if (project) projectText = [text(project.code), text(project.name)].filter(Boolean).join(" - ");
  if (!projectText) {
    projectText = [text(company.project_code), text(company.project_name)].filter(Boolean).join(" - ");
  }
  return {
    name: text(company.company_name) || text(company.name),
    lines,
    logo: text(company.company_logo_url) || text(company.logo_url) || text(company.logo),
    project: projectText,
  };
}
