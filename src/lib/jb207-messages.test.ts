import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207's new refusals, read by the people they are for (「要站在老人家的角度
 * 去思考」): each says what to do, in all four languages.
 */
const LOCALES = ["zh", "zh-TW", "en", "ms"] as const;
const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(path.join(process.cwd(), `src/messages/${locale}.json`), "utf8")),
  ]),
);

describe("JB207 error codes", () => {
  it("are worded in every language", () => {
    for (const locale of LOCALES) {
      for (const code of ["dispatch_not_loaded", "recycler_standard_plan", "standard_plan_no_partnership"]) {
        expect(messages[locale].errors.api[code], `${locale} ${code}`).toBeTruthy();
      }
    }
  });

  it("name the driver's own button at the gate (JB207-10)", () => {
    for (const locale of LOCALES) {
      expect(messages[locale].errors.api.dispatch_not_loaded, locale).toContain(
        messages[locale].driver.action.LOADED,
      );
    }
  });

  it("tell the contractor to pick a 合作版 recycler (JB207-11)", () => {
    expect(messages.zh.errors.api.recycler_standard_plan).toBe(
      "这家回收商是标准版，不能接收建筑商的订单。请选择合作版回收商。",
    );
    expect(messages.zh.errors.api.standard_plan_no_partnership).toContain("合作版");
  });
});
