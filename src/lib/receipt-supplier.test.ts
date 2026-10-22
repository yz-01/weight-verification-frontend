import { describe, expect, it } from "vitest";

import {
  NO_SUPPLIER_ITEM,
  UNFILLED_SUPPLIER,
  needsSupplier,
  supplierFilterValue,
  supplierFromSelect,
  supplierSelectValue,
  supplierShown,
} from "@/lib/receipt-supplier";

/** 「未填供应商」 (2026-10-15 I23): the phone's default, the office's to-do. */
describe("receipt supplier", () => {
  it("shows 「未填供应商」 selected for a draft with no supplier", () => {
    expect(supplierSelectValue("")).toBe(NO_SUPPLIER_ITEM);
    expect(supplierSelectValue(undefined)).toBe(NO_SUPPLIER_ITEM);
    expect(supplierSelectValue("s1")).toBe("s1");
  });

  it("keeps the draft's supplier empty when 「未填供应商」 is picked", () => {
    expect(supplierFromSelect(NO_SUPPLIER_ITEM)).toBe("");
    expect(supplierFromSelect("s1")).toBe("s1");
  });

  it("names the supplier, or says it is not filled in", () => {
    expect(supplierShown("Ready Mix", "未填供应商")).toBe("Ready Mix");
    expect(supplierShown("", "未填供应商")).toBe("未填供应商");
    expect(supplierShown(null, "未填供应商")).toBe("未填供应商");
    expect(supplierShown("  ", "未填供应商")).toBe("未填供应商");
  });

  it("asks for the supplier on any delivery that counts, rejected ones too (J19)", () => {
    expect(needsSupplier({ supplier: null })).toBe(true);
    expect(needsSupplier({ supplier: "" })).toBe(true);
    expect(needsSupplier({ supplier: "s1" })).toBe(false);
    // A correction replaced it: the correction is the one to fill in.
    expect(needsSupplier({ supplier: null, superseded_by: { id: "c" } })).toBe(false);
  });

  it("filters the unfilled line with supplier=none", () => {
    expect(supplierFilterValue(null)).toBe(UNFILLED_SUPPLIER);
    expect(supplierFilterValue("")).toBe("none");
    expect(supplierFilterValue("s1")).toBe("s1");
  });
});
