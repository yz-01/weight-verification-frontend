import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

import { MAX_REPORT_DAYS, addDays } from "./daily-reports";

/**
 * 日报告 fix round (H15): a report covers at most 31 days (D5), a record
 * deleted after saving stays in it labelled (D4), and the list export's
 * author column says what the PDF says.
 */
function source() {
  return readFileSync(path.join(process.cwd(), "src/components/progress/daily-reports.tsx"), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

describe("a daily report's days (D5)", () => {
  it("stop 31 days after the first, as the server does", () => {
    expect(MAX_REPORT_DAYS).toBe(31);
    expect(addDays("2026-10-01", MAX_REPORT_DAYS - 1)).toBe("2026-10-31");
    expect(addDays("2026-02-15", 30)).toBe("2026-03-17");
    expect(source()).toMatch(/max=\{latest \|\| undefined\}/);
  });
});

describe("a deleted record (D4)", () => {
  it("is labelled in all four languages", () => {
    expect(source()).toMatch(/entry\.is_deleted \?/);
    expect(zh.progressPage.reports.recordDeleted).toBe("记录已删除");
    expect(zhTW.progressPage.reports.recordDeleted).toBe("記錄已刪除");
    expect(en.progressPage.reports.recordDeleted).toBe("Record deleted");
    expect(ms.progressPage.reports.recordDeleted).not.toBe("");
  });
});

describe("the list export's author column", () => {
  it("uses the PDF's word, not 记录人", () => {
    expect(source()).toMatch(/key: "author_name", label: t\("reports\.author"\)/);
    expect(zh.progressPage.reports.author).toBe("撰写人");
    expect(zhTW.progressPage.reports.author).toBe("撰寫人");
    expect(en.progressPage.reports.author).toBe("Written by");
    expect(ms.progressPage.reports.author).toBe("Ditulis oleh");
  });
});
