/**
 * I9 (ID25 as amended by ID66): an opened daily report turns like a book.
 * JB175 (client 11-12): the book is the opened report's project and month,
 * oldest first (`get_month_book`), and 上个月 / 下个月 move between the months
 * that project has reports in. The rows-of-the-list paging this file used to
 * test (`bookPage` / `bookPosition`) is gone with it.
 */
import { describe, expect, it } from "vitest";

import {
  arrowStep,
  bookCounter,
  isTopDialog,
  monthWords,
  neighbourMonth,
  swipeStep,
  turnTo,
} from "@/lib/report-book";

/** One project's November, oldest first, as `get_month_book` answers it. */
const NOVEMBER = ["11-02 (28/10–02/11)", "11-05", "11-12 (09/11–12/11)", "11-12 补记"];

describe("the book of daily reports (I9, JB175)", () => {
  it("turns through the month in its order, 下一篇 to the newer one", () => {
    // Opened at 11-05; 下一篇 twice, then 上一篇 three times.
    let position = NOVEMBER.indexOf("11-05");
    const read = [NOVEMBER[position]];
    for (const by of [1, 1, -1, -1, -1] as const) {
      position = turnTo(position, NOVEMBER.length, by) ?? position;
      read.push(NOVEMBER[position]);
    }
    expect(read).toEqual([
      "11-05",
      "11-12 (09/11–12/11)",
      "11-12 补记",
      "11-12 (09/11–12/11)",
      "11-05",
      "11-02 (28/10–02/11)",
    ]);
  });

  it("stops at either end of the month", () => {
    expect(turnTo(0, NOVEMBER.length, -1)).toBeNull();
    expect(turnTo(NOVEMBER.length - 1, NOVEMBER.length, 1)).toBeNull();
    expect(turnTo(0, 1, 1)).toBeNull();
    expect(turnTo(0, 0, 1)).toBeNull();
  });

  it("says which page it is, 「第 n / 共 N 篇」", () => {
    expect(bookCounter(0, 4)).toEqual({ n: 1, total: 4 });
    expect(bookCounter(3, 4)).toEqual({ n: 4, total: 4 });
    // A month that shrank while open never says 「第 3 / 共 2 篇」.
    expect(bookCounter(2, 2)).toEqual({ n: 3, total: 3 });
  });

  it("goes to the nearest month that has reports, and nowhere past the ends", () => {
    const months = ["2026-08", "2026-09", "2026-11"];
    // October has none for this project: 上个月 from November is September.
    expect(neighbourMonth(months, "2026-11", -1)).toBe("2026-09");
    expect(neighbourMonth(months, "2026-09", 1)).toBe("2026-11");
    expect(neighbourMonth(months, "2026-08", -1)).toBeNull();
    expect(neighbourMonth(months, "2026-11", 1)).toBeNull();
    // A month no longer in the list (its last report removed) still has neighbours.
    expect(neighbourMonth(months, "2026-10", -1)).toBe("2026-09");
    expect(neighbourMonth(months, "2026-10", 1)).toBe("2026-11");
    // Order as given does not matter; across a year end.
    expect(neighbourMonth(["2027-01", "2026-12"], "2027-01", -1)).toBe("2026-12");
    expect(neighbourMonth([], "2026-11", 1)).toBeNull();
  });

  it("names the month as each language writes it", () => {
    expect(monthWords("2026-11", "zh")).toEqual({ year: "2026", month: "11" });
    expect(monthWords("2026-01", "zh-TW")).toEqual({ year: "2026", month: "1" });
    expect(monthWords("2026-11", "en")).toEqual({ year: "2026", month: "November" });
    expect(monthWords("2026-03", "ms")).toEqual({ year: "2026", month: "Mac" });
  });
});

describe("turning with the keys and a finger", () => {
  it("← is the page before, → the next", () => {
    expect(arrowStep({ key: "ArrowLeft" })).toBe(-1);
    expect(arrowStep({ key: "ArrowRight" })).toBe(1);
    expect(arrowStep({ key: "ArrowUp" })).toBeNull();
    expect(arrowStep({ key: "Enter" })).toBeNull();
  });

  it("leaves the arrows alone while typing, with a modifier, or once taken", () => {
    expect(arrowStep({ key: "ArrowRight", target: { tagName: "INPUT" } })).toBeNull();
    expect(arrowStep({ key: "ArrowRight", target: { tagName: "textarea" } })).toBeNull();
    expect(arrowStep({ key: "ArrowRight", target: { tagName: "SELECT" } })).toBeNull();
    expect(arrowStep({ key: "ArrowRight", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
    expect(arrowStep({ key: "ArrowLeft", altKey: true })).toBeNull();
    expect(arrowStep({ key: "ArrowLeft", metaKey: true })).toBeNull();
    expect(arrowStep({ key: "ArrowLeft", ctrlKey: true })).toBeNull();
    expect(arrowStep({ key: "ArrowLeft", shiftKey: true })).toBeNull();
    expect(arrowStep({ key: "ArrowLeft", defaultPrevented: true })).toBeNull();
    expect(arrowStep({ key: "ArrowRight", target: { tagName: "BUTTON" } })).toBe(1);
  });

  it("turns on a sideways stroke, not on reading down the page", () => {
    // Drawn to the left: the next report, as a book's page.
    expect(swipeStep(-120, 10)).toBe(1);
    // Drawn to the right: the one before.
    expect(swipeStep(120, -8)).toBe(-1);
    // Too short, or mostly up and down.
    expect(swipeStep(-30, 0)).toBeNull();
    expect(swipeStep(-90, 80)).toBeNull();
    expect(swipeStep(0, 300)).toBeNull();
  });

  it("gives the arrows to a photograph opened over the report (大图打开时左右键给大图用)", () => {
    const report = { id: "report" } as unknown as Element;
    const photo = { id: "photo" } as unknown as Element;
    const open = (...dialogs: Element[]) => ({
      querySelectorAll: () => dialogs as unknown as NodeListOf<Element>,
    });
    expect(isTopDialog(report, open(report))).toBe(true);
    expect(isTopDialog(report, open(report, photo))).toBe(false);
    expect(isTopDialog(photo, open(report, photo))).toBe(true);
    expect(isTopDialog(null, open(report))).toBe(false);
    expect(isTopDialog(report, open())).toBe(false);
  });
});
