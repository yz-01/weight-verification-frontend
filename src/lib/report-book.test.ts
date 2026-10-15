/**
 * I9 (ID25 as amended by ID66): an opened daily report turns like a book, in
 * the list's own order - newest written first (I28) - and reads on past the
 * last row of a list page into the next one.
 */
import { describe, expect, it } from "vitest";

import {
  arrowStep,
  bookCounter,
  bookPage,
  bookPosition,
  isTopDialog,
  swipeStep,
  turnTo,
} from "@/lib/report-book";

const PAGE = 20;

/** The list as the server pages it: 25 reports, newest written first. */
const LIST = Array.from({ length: 25 }, (_, index) => `report-${index + 1}`);
const pageOf = (page: number) => LIST.slice((page - 1) * PAGE, page * PAGE);
const reportAt = (position: number) => {
  const { page, index } = bookPage(position, PAGE);
  return pageOf(page)[index];
};

describe("the book of daily reports (I9)", () => {
  it("opens at the row clicked, wherever its list page is", () => {
    expect(bookPosition(1, 0, PAGE)).toBe(0);
    expect(bookPosition(2, 3, PAGE)).toBe(23);
    expect(reportAt(bookPosition(2, 3, PAGE))).toBe("report-24");
    expect(bookPage(19, PAGE)).toEqual({ page: 1, index: 19 });
    expect(bookPage(20, PAGE)).toEqual({ page: 2, index: 0 });
  });

  it("turns in the list's order and reads on into the next page", () => {
    // Clicked the 19th row; 下一篇 three times: 20, then 21 and 22 from page 2.
    let position = bookPosition(1, 18, PAGE);
    const read = [reportAt(position)];
    for (let turn = 0; turn < 3; turn += 1) {
      position = turnTo(position, LIST.length, 1) ?? position;
      read.push(reportAt(position));
    }
    expect(read).toEqual(["report-19", "report-20", "report-21", "report-22"]);
    // And back again across the page boundary.
    position = turnTo(position, LIST.length, -1) ?? position;
    position = turnTo(position, LIST.length, -1) ?? position;
    expect(reportAt(position)).toBe("report-20");
    expect(bookPage(position, PAGE).page).toBe(1);
  });

  it("stops at either end of the book", () => {
    expect(turnTo(0, LIST.length, -1)).toBeNull();
    expect(turnTo(LIST.length - 1, LIST.length, 1)).toBeNull();
    expect(turnTo(0, 1, 1)).toBeNull();
    expect(turnTo(0, 0, 1)).toBeNull();
  });

  it("says which page it is, 「第 n / 共 N 篇」", () => {
    expect(bookCounter(0, 25)).toEqual({ n: 1, total: 25 });
    expect(bookCounter(24, 25)).toEqual({ n: 25, total: 25 });
    // A list that shrank while open never says 「第 3 / 共 2 篇」.
    expect(bookCounter(2, 2)).toEqual({ n: 3, total: 3 });
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
