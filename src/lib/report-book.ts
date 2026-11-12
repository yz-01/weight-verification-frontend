/**
 * 日报告 read like a book (I9, ID25 as amended by ID66).
 *
 * The client: 「点进去看日报告的应该是一本书，好像翻书本那样每一页一篇，不用点
 * 进点出」. An opened report has 上一篇 / 下一篇, the ← and → keys and a
 * sideways swipe on a phone, and says 「第 n / 共 N 篇」.
 *
 * JB175 (client 11-12): 「同一个项目、同一个月份的所有日报告，可以通过「上一篇」
 * 「下一篇」连续查看」. The pages are no longer the rows of the list it was
 * opened from: they are every report of the opened one's project in its month
 * (`daily-reports/get_month_book/`), oldest first, and 上个月 / 下个月 move
 * between the months that project has reports in.
 *
 * Kept free of React and the DOM so the order and the gestures are tested on
 * their own (`report-book.test.ts`).
 */

/** The position one turn away, or `null` past either end of the book. */
export function turnTo(position: number, total: number, by: -1 | 1): number | null {
  const next = position + by;
  return next >= 0 && next < total ? next : null;
}

/** 「第 n / 共 N 篇」's two numbers. */
export function bookCounter(position: number, total: number): { n: number; total: number } {
  const n = Math.max(0, Math.floor(position)) + 1;
  return { n, total: Math.max(total, n) };
}

/**
 * The report a month book shows (JB175): the one opened or turned to, or -
 * after a change of month, `chosen` being `null` - that month's first, once
 * its pages have come (`waiting` while they are on their way).
 */
export function shownReport(
  chosen: string | null,
  pages: readonly { id: string }[],
  waiting: boolean,
): string | undefined {
  if (chosen) return chosen;
  return waiting ? undefined : pages[0]?.id;
}

/** Where report `id` sits in the month's pages (0-based); the first when it is not there. */
export function bookPlace(pages: readonly { id: string }[], id: string | undefined): number {
  return Math.max(0, pages.findIndex((page) => page.id === id));
}

/**
 * 上个月 (-1) / 下个月 (+1): the nearest earlier or later month (`YYYY-MM`)
 * among `months` - the months this project has reports in - or `null` when
 * there is none. A month without reports is skipped, never opened empty.
 */
export function neighbourMonth(months: readonly string[], month: string, by: -1 | 1): string | null {
  const sorted = [...months].sort();
  if (by < 0) return sorted.filter((each) => each < month).at(-1) ?? null;
  return sorted.find((each) => each > month) ?? null;
}

/**
 * 「2026 年 11 月」 / 「November 2026」's two values: the year, and the month -
 * its number in Chinese, its name in English and Malay.
 */
export function monthWords(month: string, locale: string): { year: string; month: string } {
  const [year, number] = month.split("-");
  const index = Number(number);
  if (!year || !index) return { year: year ?? "", month: number ?? "" };
  if (locale.startsWith("zh")) return { year, month: String(index) };
  const name = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(year), index - 1, 1)),
  );
  return { year, month: name };
}

/** What a key press needs to say about itself. */
export interface ArrowKeyEvent {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
}

/** Whether the press went into something the reader types in. */
function typingInto(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
}

/**
 * ← is -1 (the page before), → is +1 (the next). `null` for any other key, a
 * key with a modifier (the browser's own back and forward), a press inside a
 * field (moving the caret) or one something else already took.
 */
export function arrowStep(event: ArrowKeyEvent): -1 | 1 | null {
  if (event.defaultPrevented) return null;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (typingInto(event.target)) return null;
  if (event.key === "ArrowLeft") return -1;
  if (event.key === "ArrowRight") return 1;
  return null;
}

/** How far a finger has to travel sideways before it turns a page. */
export const SWIPE_DISTANCE = 60;

/**
 * A finger's stroke from its start to its end: drawn to the left turns to the
 * next page (+1), to the right back to the one before (-1), as in a book.
 * Too short, or more up-and-down than sideways (reading down the report),
 * turns nothing.
 */
export function swipeStep(dx: number, dy: number, distance = SWIPE_DISTANCE): -1 | 1 | null {
  if (Math.abs(dx) < distance) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 1 : -1;
}

/**
 * Whether `element` is the open dialog on top - the one the reader is
 * looking at. A photograph opened over a report is a dialog of its own on
 * top of it, so while it is open the arrows and the swipes are its, not the
 * report's (I9: 大图打开时左右键给大图用).
 */
export function isTopDialog(
  element: Element | null | undefined,
  root: Pick<Document, "querySelectorAll"> | undefined = typeof document === "undefined" ? undefined : document,
): boolean {
  if (!element || !root) return false;
  const open = root.querySelectorAll('[data-slot="dialog-content"][data-state="open"]');
  return open.length > 0 && open[open.length - 1] === element;
}
