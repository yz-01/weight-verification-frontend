import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { localToday } from "@/lib/local-date";

/**
 * JB207W (walk 11-17): 记录付款's 付款日期 opened on yesterday before 08:00 in
 * Malaysia - `new Date().toISOString().slice(0, 10)` is the UTC date. Every
 * form that defaulted a date to "today" that way now uses the reader's own
 * calendar day.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

describe("localToday", () => {
  it("is the calendar day the clock on the wall shows", () => {
    // 06:12 on 17 Nov, local time: the moment the walk saw 16/11.
    expect(localToday(new Date(2026, 10, 17, 6, 12))).toBe("2026-11-17");
    expect(localToday(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("is what every form date that starts on today uses", () => {
    const offenders = sources(path.join(process.cwd(), "src")).filter((file) =>
      readFileSync(file, "utf8").includes("new Date().toISOString().slice(0, 10)"),
    );
    expect(offenders).toEqual([]);
  });

  it("is the 付款日期 default of 记录付款", () => {
    const view = readFileSync(
      path.join(process.cwd(), "src/components/settlements/view-settlement.tsx"),
      "utf8",
    );
    const dialog = view.slice(view.indexOf("function PaymentDialog"));
    expect(dialog).toContain("localToday()");
  });
});
