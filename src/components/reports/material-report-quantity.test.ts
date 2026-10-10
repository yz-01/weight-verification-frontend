/**
 * Lucas, 2026-10-10 (图1): 「为什么这里有两次收货，可是累计数量还是一样呢，
 * 保留一个就好了吧」.
 *
 * 「按材料统计数量」 had 数量 and 累计数量 side by side; with no dates chosen
 * they were the same number on every line, so a line with 2 deliveries looked
 * as if the second had not been added. One quantity is left - 累计数量, the
 * deliveries 收货次数 counts, added up (the server's `quantity`, which sums
 * them) - on the screen and in the file, whose closing section asks the
 * server for that one column only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

const source = readFileSync(
  path.join(process.cwd(), "src/components/reports/material-report.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const quantityReport = source.slice(
  source.indexOf("function QuantityReport("),
  source.indexOf("function CostReport("),
);

describe("「按材料统计数量」 has one quantity", () => {
  it("heads it 累计数量 and shows the summed quantity once, beside 收货次数", () => {
    expect(quantityReport.match(/<TableHead\b[^>]*>/g)).toHaveLength(5);
    expect(quantityReport).toContain('{t("receipts.field.cumulativeQuantity")}</TableHead>');
    expect(quantityReport).not.toContain('{t("reports.receipts.quantity")}</TableHead>');
    expect(quantityReport).toContain("{row.quantity}</TableCell>");
    expect(quantityReport).not.toContain("row.cumulative_quantity");
    expect(quantityReport).toContain('{t("reports.receipts.deliveries")}</TableHead>');
    // A material with no delivery in the period would only show 0 and 0.
    expect(quantityReport).toContain(".filter((row) => row.receipts > 0)");
  });

  it("asks the file for the same single column", () => {
    const exportCall = source.slice(source.indexOf("function runExport("), source.indexOf("return (", source.indexOf("function runExport(")));
    expect(exportCall).toContain('quantityLabel: t("receipts.field.cumulativeQuantity")');
    expect(exportCall).not.toContain("cumulativeLabel");
    expect(exportCall).not.toContain('key: "cumulative_quantity"');
  });

  it("explains the one column in every language, without the old two-column wording", () => {
    expect(zh.materialReports.quantity.cumulativeHint).not.toContain("两栏");
    expect(zhTW.materialReports.quantity.cumulativeHint).not.toContain("兩欄");
    expect(en.materialReports.quantity.cumulativeHint).not.toMatch(/the two match/i);
    expect(ms.materialReports.quantity.cumulativeHint).not.toMatch(/kedua-duanya sama/i);
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect("periodQuantity" in catalogue.materialReports.export).toBe(false);
    }
  });
});
