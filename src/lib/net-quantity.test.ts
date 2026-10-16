import { describe, expect, it } from "vitest";

import { formatNetQuantity, formatNetQuantityInSentence } from "@/lib/net-quantity";

describe("累计进场与退场 numbers (I41-5)", () => {
  it("drops useless decimals and keeps the real ones", () => {
    expect(formatNetQuantity("22.000")).toBe("22");
    expect(formatNetQuantity("12.700")).toBe("12.7");
    expect(formatNetQuantity("0.125")).toBe("0.125");
  });

  it("groups thousands", () => {
    expect(formatNetQuantity("50350")).toBe("50,350");
    expect(formatNetQuantity("1234567.500")).toBe("1,234,567.5");
  });

  it("says 0 in a sentence, where a dash would be odd", () => {
    expect(formatNetQuantityInSentence("0.000")).toBe("0");
    expect(formatNetQuantityInSentence("22.000")).toBe("22");
  });

  it("shows nothing as a dash", () => {
    expect(formatNetQuantity("0")).toBe("—");
    expect(formatNetQuantity("0.000")).toBe("—");
    expect(formatNetQuantity(0)).toBe("—");
    expect(formatNetQuantity("")).toBe("—");
    expect(formatNetQuantity(undefined)).toBe("—");
  });
});
