import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isValidUnitPrice } from "@/components/contractor-ops/material-prices";

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
