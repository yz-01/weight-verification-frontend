/**
 * What choosing a material column fills in on the phone (2026-10 A4, D1, Q1, Q13).
 *
 * The office sets 「钢筋」 up once: its unit, the suppliers allowed to deliver
 * it, the manufacturers the contract designates. On the phone, choosing the
 * column then:
 *
 * - shows the column's unit - shown, not asked;
 * - picks the supplier when the column names exactly one, and otherwise
 *   offers only the ones it names;
 * - picks the manufacturer when the column designates exactly one.
 *
 * A scanned supplier QR code wins over all of it (Q1): the code says who is
 * at the gate, and the column's list says who is usually allowed - when they
 * disagree, the lorry in front of the guard is the fact.
 *
 * Pure, so the rules are tested without rendering a form.
 */

export interface AutofillColumn {
  default_unit?: string;
  supplier_options?: readonly { id: string; is_active: boolean }[];
  manufacturer_options?: readonly { id: string; is_active: boolean }[];
}

export interface AutofillState {
  unit: string;
  supplier: string;
  manufacturer: string;
}

export interface AutofillResult extends AutofillState {
  /** The column decided the unit: show it, do not offer a picker. */
  unitLocked: boolean;
  /**
   * The suppliers the picker offers: the column's own when it names any,
   * otherwise `null` - meaning every active supplier.
   */
  supplierIds: string[] | null;
  /** The supplier came from the column, not from a person or a scan. */
  supplierFromColumn: boolean;
  manufacturerFromColumn: boolean;
}

export function columnAutofill(
  column: AutofillColumn | null | undefined,
  current: AutofillState,
  options: { scannedSupplier?: string } = {},
): AutofillResult {
  const scanned = options.scannedSupplier || "";
  const unit = column?.default_unit || current.unit;
  const allowed = (column?.supplier_options ?? [])
    .filter((row) => row.is_active)
    .map((row) => row.id);
  const supplierIds = allowed.length ? allowed : null;

  let supplier = current.supplier;
  let supplierFromColumn = false;
  if (scanned) {
    supplier = scanned;
  } else if (allowed.length === 1) {
    supplier = allowed[0];
    supplierFromColumn = true;
  } else if (allowed.length > 1 && supplier && !allowed.includes(supplier)) {
    // Chosen for the previous column, not one this column allows: ask again.
    supplier = "";
  }

  const designated = (column?.manufacturer_options ?? [])
    .filter((row) => row.is_active)
    .map((row) => row.id);
  let manufacturer = current.manufacturer;
  let manufacturerFromColumn = false;
  if (designated.length === 1 && !manufacturer) {
    manufacturer = designated[0];
    manufacturerFromColumn = true;
  }

  return {
    unit,
    supplier,
    manufacturer,
    unitLocked: Boolean(column?.default_unit),
    supplierIds,
    supplierFromColumn,
    manufacturerFromColumn,
  };
}

/** 「非指定厂商」: the column designates some, and this is not one of them. */
export function isOffList(
  column: Pick<AutofillColumn, "manufacturer_options"> | null | undefined,
  manufacturer: string | null | undefined,
): boolean {
  const designated = column?.manufacturer_options ?? [];
  return Boolean(manufacturer) && designated.length > 0 && !designated.some((row) => row.id === manufacturer);
}
