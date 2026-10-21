/**
 * J10-3: a long company list gets an A–Z row; each name is filed under its
 * first letter, and anything else - a digit, a Chinese name - under 「#」.
 */
import { describe, expect, it } from "vitest";

import { LETTERS_FROM, initialOf } from "@/components/material-requests/option-combobox";

describe("the A–Z row of a long dropdown (J10-3)", () => {
  it("files a name under its first letter, whatever its case", () => {
    expect(initialOf("Sunway Concrete")).toBe("S");
    expect(initialOf("  alpha builders")).toBe("A");
  });

  it("files a digit, a Chinese name or a symbol under #", () => {
    expect(initialOf("1-Stop Rebar")).toBe("#");
    expect(initialOf("建材供应商")).toBe("#");
    expect(initialOf("(M) Sdn Bhd")).toBe("#");
  });

  it("appears only once the list is long - about 30 (J10 要做 4)", () => {
    expect(LETTERS_FROM).toBe(30);
  });
});
