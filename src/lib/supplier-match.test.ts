import { describe, expect, it } from "vitest";

import {
  matchSupplier,
  normalizeSupplierName,
  supplierNameSimilarity,
} from "@/lib/supplier-match";

/**
 * The supplier a delivery note names, matched against the supplier list (A5).
 *
 * The phone used to fill the supplier only on an identical spelling, so a DO
 * printed 「ABC Hardware Sdn. Bhd.」 against a list entry 「ABC HARDWARE SB」
 * left the field empty every time.
 */

const SUPPLIERS = [
  { id: "abc", name: "ABC HARDWARE SB" },
  { id: "tiong", name: "Tiong Nam Concrete Sdn Bhd" },
  { id: "kl", name: "KL Steel (M) Sdn. Bhd." },
  { id: "cn", name: "建材贸易有限公司" },
];

describe("normalizeSupplierName", () => {
  it.each([
    ["ABC Hardware Sdn. Bhd.", "abc hardware"],
    ["ABC HARDWARE SB", "abc hardware"],
    ["ABC Hardware S/B", "abc hardware"],
    ["KL Steel (M) Sdn. Bhd.", "kl steel"],
    ["Syarikat X & Y Berhad", "syarikat x y"],
    ["  Tiong-Nam   Concrete, SDN BHD ", "tiong nam concrete"],
    ["建材贸易有限公司", "建材贸易有限公司"],
  ])("%s -> %s", (raw, cleaned) => {
    expect(normalizeSupplierName(raw)).toBe(cleaned);
  });

  it("does not strip a name down to nothing", () => {
    expect(normalizeSupplierName("SB")).toBe("sb");
  });
});

describe("matchSupplier", () => {
  it("treats the same name with another company form as certain", () => {
    expect(matchSupplier("ABC Hardware Sdn. Bhd.", SUPPLIERS)).toMatchObject({
      supplier: { id: "abc" },
      exact: true,
      score: 1,
    });
    expect(matchSupplier("KL STEEL SDN BHD", SUPPLIERS)).toMatchObject({
      supplier: { id: "kl" },
      exact: true,
    });
  });

  it("offers the closest supplier for an OCR misread, without calling it certain", () => {
    const match = matchSupplier("Tiong Narn Concrete Sdn Bhd", SUPPLIERS);
    expect(match).toMatchObject({ supplier: { id: "tiong" }, exact: false });
    expect(match!.score).toBeGreaterThan(0.75);
    expect(match!.score).toBeLessThan(1);
  });

  it("offers a supplier whose name is the read name plus a word", () => {
    expect(matchSupplier("ABC Hardware Trading SB", SUPPLIERS)).toMatchObject({
      supplier: { id: "abc" },
      exact: false,
    });
  });

  it("matches a Chinese name", () => {
    expect(matchSupplier("建材贸易有限公司", SUPPLIERS)).toMatchObject({
      supplier: { id: "cn" },
      exact: true,
    });
  });

  it("offers nothing when no supplier is close", () => {
    expect(matchSupplier("Mega Plumbing Supplies", SUPPLIERS)).toBeNull();
    expect(matchSupplier("", SUPPLIERS)).toBeNull();
    expect(matchSupplier(undefined, SUPPLIERS)).toBeNull();
    expect(matchSupplier("Sdn Bhd", SUPPLIERS)).toBeNull();
  });

  it("picks the closer of two similar suppliers", () => {
    const close = [
      { id: "one", name: "Lim Brothers Hardware" },
      { id: "two", name: "Lim Brother Hardware Sdn Bhd" },
    ];
    expect(matchSupplier("LIM BROTHER HARDWARE S/B", close)?.supplier.id).toBe("two");
  });

  it("scores symmetrically", () => {
    expect(supplierNameSimilarity("ABC SB", "abc sdn bhd")).toBe(1);
    expect(supplierNameSimilarity("abc hardware", "abc hardwre")).toBeCloseTo(
      supplierNameSimilarity("abc hardwre", "abc hardware"),
    );
  });
});
