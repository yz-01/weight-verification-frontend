import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isValidUnitPrice } from "@/components/contractor-ops/material-prices";
import { groupMoney } from "@/components/contractor-ops/category-management";
import { lineCost } from "@/components/shared/material-lines";
import { priceSavedToast } from "@/services/material-price.service";

/**
 * 材料单价 (JB167, 客户 11-11): 「材料分类管理已经设定单价，材料每次进场时，系统
 * 必须根据材料名称、规格自动带出单价」「每次调整价格必须保留历史，包括旧价格、新
 * 价格、修改人、修改时间及生效日期」「材料分类管理的实际花费与材料成本报表必须
 * 统一计算」.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const LANGUAGES = ["zh", "zh-TW", "en", "ms"] as const;
const catalogue = (language: string) =>
  JSON.parse(read(`src/messages/${language}.json`)) as Record<string, Record<string, unknown>>;

describe("a unit price as typed", () => {
  it("is above zero with at most two decimals", () => {
    for (const ok of ["650", "650.5", "650.50", "0.01", "1,250.00"]) {
      expect(isValidUnitPrice(ok), ok).toBe(true);
    }
    for (const bad of ["", "0", "0.00", "-5", "1.234", "abc", "1e3"]) {
      expect(isValidUnitPrice(bad), bad).toBe(false);
    }
  });
});

describe("the 价格历史 says what the client listed, in every language", () => {
  it("has 旧价格、新价格、修改人、修改时间、生效日期", () => {
    for (const language of LANGUAGES) {
      const words = catalogue(language).materialPrices as { col: Record<string, string> };
      for (const key of ["oldPrice", "newPrice", "by", "at", "from"]) {
        expect(words.col[key], `${language} ${key}`).toBeTruthy();
      }
    }
    expect((catalogue("zh").materialPrices as { col: Record<string, string> }).col).toMatchObject({
      oldPrice: "旧价格",
      newPrice: "新价格",
      by: "修改人",
      at: "修改时间",
      from: "生效日期",
    });
  });
});

describe("the category's spend is the cost report's figure (第 6 点)", () => {
  it("no longer speaks of delivery orders that could not be read", () => {
    for (const language of LANGUAGES) {
      const budget = (catalogue(language).categoryManagement as { budget: Record<string, string> }).budget;
      expect(budget.uncounted, language).toContain("{count}");
      expect(budget.vsPrice, language).toBeTruthy();
    }
    const zh = (catalogue("zh").categoryManagement as { budget: Record<string, string> }).budget;
    expect(zh.uncounted).toBe("有 {count} 条记录没有单价，没有算进合计。");
    expect(zh.uncounted).not.toContain("送货单");
  });

  it("opens the 单价 dialog from the material list, and says 预算 is not 单价 beside the budget", () => {
    const management = read("src/components/contractor-ops/category-management.tsx");
    expect(management).toContain("<MaterialPriceDialog");
    expect(management).toContain("<PriceLine");
    expect(read("src/components/contractor-ops/operations-workspaces.tsx")).toContain('modules("budget.vsPrice")');
  });

  it("tells the correction form when the price came from the list", () => {
    const form = read("src/components/receipts/create-receipt.tsx");
    expect(form).toContain('receipt.unit_price_source === "PRICE_LIST"');
    expect(form).toContain('t("receipts.field.unitPriceFromList")');
  });
});

describe("a record's material lines (browser check 11-11)", () => {
  it("show 成本 = 数量 × 单价 beside the price, not a blank 金额", () => {
    expect(lineCost("12.000", "700.00")).toBe("8,400.00");
    expect(lineCost("0.125", "10.05")).toBe("1.26");
    expect(lineCost("1000", "1250.5")).toBe("1,250,500.00");
    for (const [qty, price] of [["12.000", null], [null, "700.00"], ["12", ""], ["12", "0"], ["x", "1"]]) {
      expect(lineCost(qty, price), `${qty} × ${price}`).toBeNull();
    }
    for (const language of LANGUAGES) {
      expect(catalogue(language).materialLines.cost, language).toBeTruthy();
    }
  });

  it("refreshes 材料分类's list (its 单价 line and 花费) after a price is saved", () => {
    expect(read("src/components/contractor-ops/material-prices.tsx")).toContain(
      'invalidateQueries({ queryKey: ["category-management"] })',
    );
  });
});

describe("材料分类's 花费 (browser check 11-11)", () => {
  it("groups thousands like the cost report, so RM 23,600.00 reads the same on both", () => {
    expect(groupMoney("23600.00")).toBe("23,600.00");
    expect(groupMoney("650.00")).toBe("650.00");
    expect(groupMoney("1234567.5")).toBe("1,234,567.5");
    expect(groupMoney("-2500.00")).toBe("-2,500.00");
    expect(groupMoney(null)).toBe("");
    expect(groupMoney("abc")).toBe("abc");
  });
});

describe("设定单价 fills the 材料领用 too (JB171: 「请修复单价关联」)", () => {
  it("says how many deliveries and issues it filled in", () => {
    expect(priceSavedToast({ filled: 2, filled_issue_lines: 3 })).toEqual([
      "materialPrices.toast.filledWithIssues",
      { count: 2, issues: 3 },
    ]);
    expect(priceSavedToast({ filled: 0, filled_issue_lines: 1 })[0]).toBe("materialPrices.toast.filledWithIssues");
  });

  it("keeps JB167's words when no issue was filled in", () => {
    expect(priceSavedToast({ filled: 2, filled_issue_lines: 0 })).toEqual(["materialPrices.toast.filled", { count: 2 }]);
    expect(priceSavedToast({ filled: 2 })).toEqual(["materialPrices.toast.filled", { count: 2 }]);
    expect(priceSavedToast({ filled: 0 })).toEqual(["materialPrices.toast.saved", undefined]);
  });

  it("is worded 「补上了 N 条没有单价的进场记录、M 项材料领用」 in every language", () => {
    for (const language of LANGUAGES) {
      const toast = (catalogue(language).materialPrices as { toast: Record<string, string> }).toast;
      expect(toast.filledWithIssues, language).toContain("{count}");
      expect(toast.filledWithIssues, language).toContain("{issues}");
    }
    const zh = (catalogue("zh").materialPrices as { toast: Record<string, string> }).toast;
    expect(zh.filledWithIssues).toContain("补上了 {count} 条没有单价的进场记录、{issues} 项材料领用");
  });
});
