/**
 * J36 (客户 10-22): 材料数量报表 has three views - normal, 不合格材料, 材料退场 /
 * 退货 - chosen by one filter and by two cards; the 指定厂商 filter and the
 * 待验收 / 已验收 choices are gone.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

import { viewOf } from "./material-report";

const source = readFileSync(
  path.join(process.cwd(), "src/components/reports/material-report.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("the report's view", () => {
  it("nothing chosen, or anything unknown, is the normal view", () => {
    expect(viewOf(undefined)).toBe("normal");
    expect(viewOf("PENDING")).toBe("normal");
    expect(viewOf("rejected")).toBe("rejected");
    expect(viewOf("returns")).toBe("returns");
  });

  it("offers only 不合格 and 退货 beside the normal view", () => {
    expect(source).toContain('(["rejected", "returns"] as const)');
    expect(source).not.toContain('"PENDING", "ACCEPTED"');
    expect(source).not.toContain("receipts.acceptance.title");
  });

  it("has no 指定厂商 filter and sends no manufacturer or acceptance parameter", () => {
    expect(source).not.toContain("showManufacturer\n");
    expect(source).not.toContain("manufacturer: list.filters");
    expect(source).not.toContain("acceptance: list.filters");
    expect(source).not.toContain("showManufacturer\n            showDates");
  });

  it("exports follow the view: returns go to their own file", () => {
    expect(source).toContain('if (view === "returns") {');
    expect(source).toContain("return exportMaterialReportReturns({");
    expect(source).toContain('key: "rejection_reason"');
  });
});

describe("J36 wording exists in all four languages", () => {
  for (const [name, messages] of Object.entries({ en, zh, "zh-TW": zhTW, ms })) {
    it(name, () => {
      const m = (messages as unknown as { materialReports: Record<string, Record<string, string>> })
        .materialReports;
      for (const key of ["label", "normal", "rejected", "returns"]) expect(m.view[key]).toBeTruthy();
      for (const key of ["rejected", "returns", "times"]) expect(m.cards[key]).toBeTruthy();
      for (const key of ["totalRejected", "totalReturns", "rejectedHint", "returnsHint"])
        expect(m.quantity[key]).toBeTruthy();
      for (const key of [
        "rejectedTitle",
        "returnsTitle",
        "returnsWhat",
        "reason",
        "returnNo",
        "returnedAt",
        "returnedQuantity",
      ])
        expect(m.records[key]).toBeTruthy();
    });
  }
});
