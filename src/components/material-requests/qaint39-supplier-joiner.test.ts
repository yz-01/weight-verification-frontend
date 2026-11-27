/**
 * INT39 QA (Lucas B): an MR's several suppliers are joined for the reader -
 * 「、」 in Chinese (zh, zh-TW), ", " in English and Malay, as the MR PDF does.
 * The list column and the detail pass the page's locale.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { supplierJoiner, supplierNames } from "@/interfaces/material-request";

const two = {
  suppliers: [
    { id: "a", name: "Bar Mill" },
    { id: "b", name: "Steel Trader" },
  ],
  supplier_name: "Bar Mill、Steel Trader",
};

describe("INT39 QA supplier joiner", () => {
  it("joins with 「、」 in Chinese and with a comma in English / Malay", () => {
    expect(supplierNames(two, "zh")).toBe("Bar Mill、Steel Trader");
    expect(supplierNames(two, "zh-TW")).toBe("Bar Mill、Steel Trader");
    expect(supplierNames(two, "en")).toBe("Bar Mill, Steel Trader");
    expect(supplierNames(two, "ms")).toBe("Bar Mill, Steel Trader");
    expect(supplierJoiner(undefined)).toBe("、");
  });

  it("falls back to the server's text, and says nothing when none is chosen", () => {
    expect(supplierNames({ suppliers: [], supplier_name: "Bar Mill, Steel Trader" }, "en")).toBe("Bar Mill, Steel Trader");
    expect(supplierNames({ suppliers: [], supplier_name: "" }, "en")).toBe("");
  });

  it("the list column and the detail pass the locale", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/material-requests/material-requests-office.tsx"),
      "utf8",
    );
    expect(source.match(/supplierNames\([^)]*\)/g)).toEqual([
      "supplierNames(row.original, locale)",
      "supplierNames(row, locale)",
      "supplierNames(row, locale)",
    ]);
  });
});
