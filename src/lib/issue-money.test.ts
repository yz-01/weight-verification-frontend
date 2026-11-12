/**
 * JB171 (客户 11-11 晚上「第四批」事项 2): the money decisions the 材料领用
 * screens and the cost report draw - 「没有单价」 only where it is true, a dash
 * where the money is hidden, 数量 × 单价 = 金额 as it is typed, and who may see
 * 「批量预览 / 打印」.
 */
import { describe, expect, it } from "vitest";

import type { CorrectionField } from "@/interfaces/record-correction";
import {
  isLinePrice,
  isLineQuantity,
  issueMoney,
  lineAmount,
  lineName,
  linesTotal,
  purchaseUnitPrice,
  reportMoneyHidden,
  seesIssueMoney,
  statementLetterhead,
} from "@/lib/issue-money";
import {
  correctionChanges,
  initialDraft,
  isCorrecting,
  missingRequired,
  overPlaces,
} from "@/lib/record-correction";

describe("采购单价 on 「按材料统计成本」 (第 1 点)", () => {
  it("is the price, with 「平均」 when the price changed", () => {
    expect(purchaseUnitPrice({ unit_price: "6.60", unit_price_mixed: false }, false)).toEqual({
      kind: "money",
      value: "6.60",
      average: false,
    });
    expect(purchaseUnitPrice({ unit_price: "6.45", unit_price_mixed: true }, false)).toMatchObject({ average: true });
  });

  it("says 「没有单价」 with no priced delivery, but a dash when money is hidden", () => {
    expect(purchaseUnitPrice({ unit_price: null }, false)).toEqual({ kind: "unpriced" });
    expect(purchaseUnitPrice({ unit_price: null }, true)).toEqual({ kind: "hidden" });
  });

  it("knows money is hidden when 采购成本 is blank while deliveries are priced", () => {
    expect(reportMoneyHidden({ total_cost: null, priced_receipts: 3 })).toBe(true);
    expect(reportMoneyHidden({ total_cost: "99000.00", priced_receipts: 3 })).toBe(false);
    // Nothing priced at all: 「没有单价」 is true whoever reads it.
    expect(reportMoneyHidden({ total_cost: null, priced_receipts: 0 })).toBe(false);
  });
});

describe("an issue line's 单价 and 金额", () => {
  it("is 「没有单价」 only when the server says so, never 0", () => {
    expect(issueMoney(null, false)).toEqual({ kind: "unpriced" });
    expect(issueMoney("630.00", true)).toEqual({ kind: "money", value: "630.00" });
    // 金额查看 off: null and null - a dash.
    expect(issueMoney(null, null)).toEqual({ kind: "hidden" });
  });

  it("works out 金额 as the price is typed: the quantity taken, else the quantity applied for", () => {
    const issued = { quantity: "200.000", issued_quantity: "180.000" };
    expect(lineAmount(issued, "3.50")).toEqual({ quantity: "180.000", requested: false, price: "3.50", amount: "630.00" });
    const waiting = { quantity: "200.000", issued_quantity: null };
    expect(lineAmount(waiting, "3.5")).toEqual({ quantity: "200.000", requested: true, price: "3.50", amount: "700.00" });
    expect(lineAmount({ quantity: "3", issued_quantity: null }, "0.10")?.amount).toBe("0.30");
    expect(lineAmount(issued, "")).toBeNull();
    expect(lineAmount(issued, "0")).toBeNull();
    expect(lineAmount(issued, "abc")).toBeNull();
  });

  it("works out 金额 from the quantity typed in the 改正 window when there is one (JB182)", () => {
    const issued = { quantity: "200.000", issued_quantity: "200.000" };
    expect(lineAmount(issued, "6.80", "180")).toEqual({ quantity: "180", requested: false, price: "6.80", amount: "1224.00" });
    expect(lineAmount(issued, "6.80", " 200.000 ")).toMatchObject({ quantity: "200.000", amount: "1360.00" });
    const waiting = { quantity: "200.000", issued_quantity: null };
    expect(lineAmount(waiting, "6.80", "150")).toMatchObject({ requested: true, amount: "1020.00" });
    expect(lineAmount(issued, "6.80", "")).toBeNull();
    expect(lineAmount(issued, "6.80", "abc")).toBeNull();
    expect(lineAmount(issued, "6.80", "-1")).toBeNull();
    // Without a quantity box (「填写单价」 on one line) the stored figure counts.
    expect(lineAmount(issued, "6.80", undefined)?.amount).toBe("1360.00");
    // A material handed over as 0 is worth 0.00, not 「没有单价」.
    expect(lineAmount({ quantity: "5", issued_quantity: "0.000" }, "6.80")?.amount).toBe("0.00");
  });

  it("adds the 总金额 to the cent, leaving out and counting the unpriced (JB182)", () => {
    expect(
      linesTotal([
        { priced: true, amount: "1224.00" },
        { priced: false, amount: null },
        { priced: true, amount: "0.10" },
        { priced: true, amount: "0.20" },
      ]),
    ).toEqual({ amount: "1224.30", unpriced: 1 });
    expect(linesTotal([{ priced: false, amount: null }, { priced: false, amount: null }])).toEqual({ amount: null, unpriced: 2 });
    // A price typed but not yet a number: left out, not counted as unpriced.
    expect(linesTotal([{ priced: true, amount: null }, { priced: true, amount: "5.00" }])).toEqual({ amount: "5.00", unpriced: 0 });
  });

  it("tells an issue line's 数量 from its 单价 (JB182)", () => {
    const line = { id: "l-1", position: 1, material_name: "Disel", material_specification: "", unit: "Liter", quantity: "1", issued_quantity: null };
    const base: CorrectionField = { name: "x", type: "decimal", required: false, max_length: null, value: "", display: "", options: null };
    expect(isLineQuantity({ ...base, line, line_part: "quantity" })).toBe(true);
    expect(isLinePrice({ ...base, line, line_part: "quantity" })).toBe(false);
    expect(isLinePrice({ ...base, line, line_part: "price" })).toBe(true);
    // A 单价 field from before JB182 carries no `line_part`.
    expect(isLinePrice({ ...base, line })).toBe(true);
    expect(isLinePrice(base)).toBe(false);
    expect(isLineQuantity(base)).toBe(false);
  });

  it("names the line by its number, material and specification", () => {
    expect(lineName({ position: 1, material_name: "Diesel", material_specification: "" })).toBe("1. Diesel");
    expect(lineName({ position: 2, material_name: "钢筋", material_specification: "Y16" })).toBe("2. 钢筋 Y16");
  });
});

describe("who sees 「批量预览 / 打印」 (D5: 金额查看)", () => {
  it("never the phone", () => {
    expect(seesIssueMoney(true, { amount_total: "10.00" }, [{ priced: true }])).toBe(false);
  });

  it("the office when the server sent money", () => {
    expect(seesIssueMoney(false, { amount_total: "0.00" }, [])).toBe(true);
    expect(seesIssueMoney(false, undefined, [{ priced: false }])).toBe(true);
  });

  it("not without 金额查看: the total and every line's price are null", () => {
    expect(seesIssueMoney(false, { amount_total: null }, [{ priced: null }, { priced: null }])).toBe(false);
    expect(seesIssueMoney(false, undefined, [])).toBe(false);
  });
});

describe("the statement's letterhead (JB162)", () => {
  it("reads the letterhead's own words", () => {
    expect(
      statementLetterhead({
        company: {
          company_name: "测试建筑商 1",
          company_lines: ["No. 1, Jalan Putra", "SSM 123456-A", ""],
          company_logo_url: "https://cdn.example/logo.png",
          project_code: "PRJ-0003",
          project_name: "PUTRA_MAS",
        },
        project: null,
      }),
    ).toEqual({
      name: "测试建筑商 1",
      lines: ["No. 1, Jalan Putra", "SSM 123456-A"],
      logo: "https://cdn.example/logo.png",
      project: "PRJ-0003 - PUTRA_MAS",
    });
  });

  it("reads plainer words, a project of its own, and nothing at all", () => {
    expect(
      statementLetterhead({ company: { name: "ABC Sdn Bhd", lines: ["Kuala Lumpur"] }, project: { code: "P1", name: "Site" } }),
    ).toEqual({ name: "ABC Sdn Bhd", lines: ["Kuala Lumpur"], logo: "", project: "P1 - Site" });
    expect(statementLetterhead({ company: null, project: "PRJ-0003" }).project).toBe("PRJ-0003");
    expect(statementLetterhead({ company: null, project: null })).toEqual({ name: "", lines: [], logo: "", project: "" });
  });
});

function linePrice(overrides: Partial<CorrectionField> = {}): CorrectionField {
  return {
    name: "line_price:l-1",
    type: "decimal",
    required: false,
    max_length: null,
    value: "",
    display: "",
    options: null,
    places: 2,
    line: {
      id: "l-1",
      position: 1,
      material_name: "Diesel",
      material_specification: "",
      unit: "Liter",
      quantity: "200.000",
      issued_quantity: "180.000",
    },
    ...overrides,
  };
}

describe("单价 in the 改正 window (第 2 点: 后台可以填写或更正)", () => {
  it("a first fill asks no reason; a change of a price does (修改历史)", () => {
    const blank = [linePrice()];
    const filled = correctionChanges(blank, { "line_price:l-1": "3.50" });
    expect(filled.changes).toEqual({ "line_price:l-1": "3.50" });
    expect(isCorrecting(blank, filled.changes)).toBe(false);

    const priced = [linePrice({ value: "3.50", display: "3.50" })];
    const changed = correctionChanges(priced, { "line_price:l-1": "3.80" });
    expect(isCorrecting(priced, changed.changes)).toBe(true);
    // 3.5 is 3.50: not a change.
    expect(correctionChanges(priced, { "line_price:l-1": "3.5" }).changes).toEqual({});
  });

  it("a price can be changed but not cleared; a blank may stay blank", () => {
    const priced = [linePrice({ value: "3.50" })];
    expect(missingRequired(priced, { "line_price:l-1": "" })?.name).toBe("line_price:l-1");
    expect(missingRequired(priced, { "line_price:l-1": "4" })).toBeNull();
    // Even were the server to mark it required, a line with no price yet is not blocking.
    const blank = [linePrice({ required: true })];
    expect(missingRequired(blank, initialDraft(blank))).toBeNull();
  });

  it("takes two decimals at most", () => {
    const fields = [linePrice()];
    expect(overPlaces(fields, { "line_price:l-1": "3.505" })?.name).toBe("line_price:l-1");
    expect(overPlaces(fields, { "line_price:l-1": "3.50" })).toBeNull();
    expect(overPlaces(fields, { "line_price:l-1": "3" })).toBeNull();
    // A field without `places` is never refused for its decimals.
    expect(overPlaces([linePrice({ places: undefined })], { "line_price:l-1": "3.505" })).toBeNull();
  });
});
