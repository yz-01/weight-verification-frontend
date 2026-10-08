import { describe, expect, it } from "vitest";

import { columnAutofill, isOffList } from "@/lib/material-autofill";

const A = { id: "supplier-a", is_active: true };
const B = { id: "supplier-b", is_active: true };
const MAKER_A = { id: "maker-a", is_active: true };
const MAKER_B = { id: "maker-b", is_active: true };
const EMPTY = { unit: "", supplier: "", manufacturer: "" };

describe("columnAutofill (2026-10 A4, D1, Q1)", () => {
  it("fills the steel column's unit, its only supplier and its only manufacturer", () => {
    const steel = {
      default_unit: "TONNE",
      supplier_options: [A],
      manufacturer_options: [MAKER_A],
    };
    expect(columnAutofill(steel, EMPTY)).toMatchObject({
      unit: "TONNE",
      unitLocked: true,
      supplier: "supplier-a",
      supplierFromColumn: true,
      supplierIds: ["supplier-a"],
      manufacturer: "maker-a",
      manufacturerFromColumn: true,
    });
  });

  it("offers only the two suppliers of a column that names two, and picks neither", () => {
    const result = columnAutofill({ supplier_options: [A, B] }, EMPTY);
    expect(result.supplierIds).toEqual(["supplier-a", "supplier-b"]);
    expect(result.supplier).toBe("");
  });

  it("drops a supplier chosen for another column that this one does not allow", () => {
    const result = columnAutofill({ supplier_options: [A, B] }, { ...EMPTY, supplier: "supplier-z" });
    expect(result.supplier).toBe("");
    const kept = columnAutofill({ supplier_options: [A, B] }, { ...EMPTY, supplier: "supplier-b" });
    expect(kept.supplier).toBe("supplier-b");
  });

  it("lets a scanned supplier QR code win over the column", () => {
    const result = columnAutofill(
      { supplier_options: [A] },
      EMPTY,
      { scannedSupplier: "supplier-z" },
    );
    expect(result.supplier).toBe("supplier-z");
    expect(result.supplierFromColumn).toBe(false);
  });

  it("leaves everything to the person on a column the office has not set up", () => {
    const result = columnAutofill({}, { unit: "M3", supplier: "supplier-a", manufacturer: "" });
    expect(result).toMatchObject({
      unit: "M3",
      unitLocked: false,
      supplierIds: null,
      supplier: "supplier-a",
      manufacturer: "",
    });
  });

  it("does not overwrite a manufacturer somebody already chose", () => {
    const result = columnAutofill(
      { manufacturer_options: [MAKER_A] },
      { ...EMPTY, manufacturer: "maker-b" },
    );
    expect(result.manufacturer).toBe("maker-b");
    expect(result.manufacturerFromColumn).toBe(false);
  });

  it("ignores switched-off suppliers and manufacturers", () => {
    const result = columnAutofill(
      {
        supplier_options: [A, { id: "old", is_active: false }],
        manufacturer_options: [MAKER_A, { id: "gone", is_active: false }],
      },
      EMPTY,
    );
    expect(result.supplier).toBe("supplier-a");
    expect(result.manufacturer).toBe("maker-a");
  });
});

describe("isOffList (Q13)", () => {
  const steel = { manufacturer_options: [MAKER_A] };
  it("flags a manufacturer the column does not designate", () => {
    expect(isOffList(steel, "maker-b")).toBe(true);
    expect(isOffList(steel, "maker-a")).toBe(false);
  });
  it("never flags when the column designates nobody or nothing was chosen", () => {
    expect(isOffList({ manufacturer_options: [] }, "maker-b")).toBe(false);
    expect(isOffList(steel, "")).toBe(false);
    expect(isOffList({ manufacturer_options: [MAKER_A, MAKER_B] }, "maker-b")).toBe(false);
  });
});
