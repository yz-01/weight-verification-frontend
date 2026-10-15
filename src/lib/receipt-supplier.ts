/**
 * 「未填供应商」: a material delivery the phone filed without a supplier
 * (2026-10-15 I23, ID57).
 *
 * Site workers often do not know whose lorry it is, and a required supplier
 * made them pick any one - the load then went on the wrong supplier's books.
 * So the phone may leave it out (and does by default), the office fills it in
 * with a correction, and until then the delivery counts for no supplier and
 * cannot be accepted.
 */

/** The receipts endpoints' supplier filter for the unfilled ones: `?supplier=none`. */
export const UNFILLED_SUPPLIER = "none";

/**
 * The phone dropdown's 「未填供应商」 item. A Radix `SelectItem` cannot carry
 * `""`, and the draft keeps `""` for "no supplier" - which the upload then
 * leaves out of the form, so the server files the delivery unfilled.
 */
export const NO_SUPPLIER_ITEM = "__no_supplier__";

/** The dropdown's value for a draft's supplier (`""` is 「未填供应商」). */
export function supplierSelectValue(supplier: string | null | undefined): string {
  return supplier ? supplier : NO_SUPPLIER_ITEM;
}

/** The draft's supplier for a dropdown value: 「未填供应商」 is `""`. */
export function supplierFromSelect(value: string): string {
  return value === NO_SUPPLIER_ITEM ? "" : value;
}

/** A delivery's supplier as read on screen: its name, or 「未填供应商」. */
export function supplierShown(name: string | null | undefined, unfilledLabel: string): string {
  return name && name.trim() ? name : unfilledLabel;
}

/** Whether a delivery still needs its supplier before the office can accept it. */
export function needsSupplier(receipt: {
  supplier?: string | null;
  acceptance_status?: string | null;
  superseded_by?: unknown;
}): boolean {
  return !receipt.supplier && (receipt.acceptance_status ?? "PENDING") === "PENDING" && !receipt.superseded_by;
}

/**
 * A supplier summary line's value for the filter (`by_supplier`, `get_summary`):
 * the unfilled line has no id, and picking it means `?supplier=none`.
 */
export function supplierFilterValue(supplier: string | null | undefined): string {
  return supplier ? supplier : UNFILLED_SUPPLIER;
}
