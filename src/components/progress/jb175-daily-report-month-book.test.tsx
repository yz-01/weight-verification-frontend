/**
 * JB175 (client 11-12, 事项 2): an opened 日报告 turns through every report of
 * its project in its month.
 *
 * > 2. 同一个项目、同一个月份的所有日报告，可以通过「上一篇」「下一篇」连续查看，不需要退出再重新打开。
 * > 3. 不同月份的日报告分别按月份查看，切换月份后，同样支持连续翻阅。
 * > 4. 总部选择指定项目时，只连续查看该项目的日报告；选择「全部项目」时，仍可按项目分别查看。
 * > 请统一完善现有日报告预览功能，适用于总部及所有项目。
 *
 * Rendered to static markup (the runner has no DOM): the book bar's words,
 * counter and buttons with the reason each greyed one gives. The dialog
 * itself is a portal and is not drawn here; where the opened report lands
 * and which book each entry point opens are pinned through the pure helpers
 * and the source. Turning by key, by swipe and with the buttons in a browser
 * is checked by eye (PENDING in the report).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { bookPlace, shownReport } from "@/lib/report-book";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/progress",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", features: ["progress"] }, can: () => true }),
}));

const { BookBar } = await import("@/components/progress/daily-reports");
type Nav = Parameters<typeof BookBar>[0]["book"];

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;

function bar(overrides: Partial<Nav> = {}, locale: keyof typeof CATALOGUES = "zh") {
  const book: Nav = {
    position: 1,
    total: 4,
    direction: 0,
    turning: false,
    onTurn: () => {},
    project: "Project 2B",
    month: "2026-11",
    months: ["2026-09", "2026-10", "2026-11"],
    onMonth: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>
        <BookBar book={book} />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );
}

/** Each button by its words: greyed or not, and the reason a greyed one gives. */
function buttons(html: string) {
  const found: Record<string, { disabled: boolean; reason: string | null }> = {};
  const pattern = /(<span[^>]*data-slot="reason-tip"[^>]*>)?<button([^>]*)>(.*?)<\/button>/g;
  for (const match of html.matchAll(pattern)) {
    const label = match[3].replace(/<[^>]+>/g, "").trim();
    found[label] = {
      disabled: /\sdisabled=""/.test(match[2]),
      reason: match[1]?.match(/title="([^"]*)"/)?.[1] ?? null,
    };
  }
  return found;
}

/** The words in the middle of the bar. */
function place(html: string) {
  return (html.match(/data-book-place[^>]*>(.*?)<\/span>/)?.[1] ?? "").replace(/<[^>]+>/g, "");
}

const book = zh.progressPage.reports.book;

describe("the book bar (JB175-1, JB175-2)", () => {
  it("says 「项目 · 2026 年 11 月 · 第 n / 共 N 篇」", () => {
    expect(place(bar())).toBe("Project 2B · 2026 年 11 月 · 第 2 / 共 4 篇");
    expect(place(bar({ position: 0, total: 1, month: "2026-09" }))).toBe(
      "Project 2B · 2026 年 9 月 · 第 1 / 共 1 篇",
    );
    expect(place(bar({}, "zh-TW"))).toBe("Project 2B · 2026 年 11 月 · 第 2 / 共 4 篇");
    expect(place(bar({}, "en"))).toBe("Project 2B · November 2026 · 2 of 4");
    expect(place(bar({}, "ms"))).toBe("Project 2B · November 2026 · 2 daripada 4");
  });

  it("has 上个月 · 上一篇 on the left and 下一篇 · 下个月 on the right, in that order", () => {
    const labels = Object.keys(buttons(bar()));
    expect(labels).toEqual([book.previousMonth, book.previous, book.next, book.nextMonth]);
    expect([book.previousMonth, book.nextMonth]).toEqual(["上个月", "下个月"]);
  });

  it("turns inside the month and greys 上一篇 / 下一篇 at its ends, saying why", () => {
    const middle = buttons(bar({ position: 1, total: 4 }));
    expect(middle[book.previous]).toEqual({ disabled: false, reason: null });
    expect(middle[book.next]).toEqual({ disabled: false, reason: null });
    const first = buttons(bar({ position: 0, total: 4 }));
    expect(first[book.previous]).toEqual({ disabled: true, reason: "这已经是这个月的第一篇。" });
    const last = buttons(bar({ position: 3, total: 4 }));
    expect(last[book.next]).toEqual({ disabled: true, reason: "这已经是这个月的最后一篇。" });
  });

  it("goes only to months the project has reports in, and says why it cannot", () => {
    // November is this project's latest month: no 下个月.
    const latest = buttons(bar({ month: "2026-11", months: ["2026-09", "2026-11"] }));
    expect(latest[book.previousMonth]).toEqual({ disabled: false, reason: null });
    expect(latest[book.nextMonth]).toEqual({
      disabled: true,
      reason: "这个项目没有更晚月份的日报告。",
    });
    // September is its earliest: no 上个月.
    const earliest = buttons(bar({ month: "2026-09", months: ["2026-09", "2026-11"] }));
    expect(earliest[book.previousMonth]).toEqual({
      disabled: true,
      reason: "这个项目没有更早月份的日报告。",
    });
    expect(earliest[book.nextMonth]).toEqual({ disabled: false, reason: null });
    // One month only: neither.
    const only = buttons(bar({ month: "2026-11", months: ["2026-11"] }));
    expect(only[book.previousMonth].disabled).toBe(true);
    expect(only[book.nextMonth].disabled).toBe(true);
  });

  it("has its words in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const words = messages.progressPage.reports.book;
      for (const key of ["previousMonth", "nextMonth", "noEarlierMonth", "noLaterMonth", "month"] as const) {
        expect(words[key].trim(), key).not.toBe("");
      }
      expect(words.month).toContain("{year}");
      expect(words.month).toContain("{month}");
    }
    expect(zhTW.progressPage.reports.book.previousMonth).toBe("上個月");
  });
});

describe("where an opened report lands (JB175-1, JB175-2)", () => {
  const november = [{ id: "r-1102" }, { id: "r-1105" }, { id: "r-1112a" }, { id: "r-1112b" }];

  it("opens at the report clicked, inside its month", () => {
    expect(shownReport("r-1105", november, false)).toBe("r-1105");
    expect(bookPlace(november, "r-1105")).toBe(1);
    // Before the month has come, the report clicked is already being read.
    expect(shownReport("r-1105", [], false)).toBe("r-1105");
  });

  it("after a change of month opens that month's first, once it has come", () => {
    expect(shownReport(null, november, true)).toBeUndefined();
    expect(shownReport(null, november, false)).toBe("r-1102");
    expect(bookPlace(november, "r-1102")).toBe(0);
    expect(shownReport(null, [], false)).toBeUndefined();
  });

  it("the book opens on the report and changes month within its project", () => {
    const source = read("src/components/progress/daily-reports.tsx");
    expect(source).toMatch(/useState<DailyReportMonthBookQuery>\(\{ report: opened \}\)/);
    expect(source).toMatch(/useState<string \| null>\(opened\)/);
    expect(source).toMatch(
      /setWhich\(\{ project: book\.data\.project\.id, month: target \}\);\s*setCurrent\(null\);/,
    );
    // ← → and the swipe still turn the book.
    expect(source).toMatch(/useArrowKeys\(\(step\) => book\?\.onTurn\(step\)/);
    expect(source).toMatch(/if \(step !== null\) book\.onTurn\(step\);/);
  });
});

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("both entry points open the month book (JB175-3, JB175-4)", () => {
  it("工程进度 › 日报告: a row, its 查看 and a report just written", () => {
    const source = read("src/components/progress/daily-reports.tsx");
    expect(source).toMatch(/if \(clickOpensRow\(event\)\) setViewing\(row\.id\);/);
    expect(source).toMatch(/event\.stopPropagation\(\);\s*setViewing\(row\.id\);/);
    expect(source).toMatch(/setWriting\(false\);\s*setViewing\(saved\.id\);/);
    expect(source).toMatch(
      /<DailyReportBook key=\{viewing\} report=\{viewing\} onClose=\{\(\) => setViewing\(null\)\} \/>/,
    );
    // The list itself is as it was: its filter, its page, newest written first.
    expect(source).toMatch(
      /getDailyReports\(\{ \.\.\.list\.filters, page: list\.page, page_size: PAGE \}\)/,
    );
  });

  it("报表中心 › 日报告: a preview row", () => {
    const source = read("src/components/contractor-ops/contractor-report-workspace.tsx");
    expect(source).toMatch(/const reportId = dailyReport \? record\?\.id : undefined;/);
    expect(source).toMatch(/\? \(\) => setBook\(reportId\)/);
    expect(source).toMatch(/<DailyReportBook\s+key=\{book\}\s+report=\{book\}/);
  });

  it("工程进度 › 现场照片: the report just written from the photographs", () => {
    expect(read("src/components/progress/progress-page.tsx")).toMatch(
      /<DailyReportBook key=\{written\} report=\{written\}/,
    );
  });

  it("no book turns through a list's rows any more", () => {
    for (const file of [
      "src/components/progress/daily-reports.tsx",
      "src/components/contractor-ops/contractor-report-workspace.tsx",
      "src/components/progress/progress-page.tsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/kind: "list"|kind: "ids"|bookIds|bookPosition|bookPage\(/);
    }
    // The book is read from the month book, whatever list it was opened from.
    expect(read("src/services/progress-reports.service.ts")).toContain(
      '"/api/daily-reports/get_month_book/"',
    );
    expect(read("src/components/progress/daily-reports.tsx")).toMatch(
      /queryKey: \["daily-reports", "month-book", which\],\s*queryFn: \(\) => getDailyReportMonthBook\(which\)/,
    );
  });
});
