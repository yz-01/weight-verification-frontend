/**
 * 日报告 read like a book (I9, ID25 as amended by ID66).
 *
 * The client: 「点进去看日报告的应该是一本书，好像翻书本那样每一页一篇，不用点
 * 进点出」. An opened report has 上一篇 / 下一篇, the ← and → keys and a
 * sideways swipe on a phone, and says 「第 n / 共 N 篇」. The pages are the
 * list's own rows in the list's own order - newest written first (I28) - so
 * 下一篇 after the first row is the second row, and after the last row of a
 * list page the book reads on into the next page.
 *
 * Kept free of React and the DOM so the order and the gestures are tested on
 * their own (`report-book.test.ts`).
 */

/** Where a position (0-based, over the whole list) sits: its page (1-based) and row. */
export function bookPage(position: number, pageSize: number): { page: number; index: number } {
  const size = Math.max(1, Math.floor(pageSize));
  const at = Math.max(0, Math.floor(position));
  return { page: Math.floor(at / size) + 1, index: at % size };
}

/** The position of row `index` on list page `page` (1-based). */
export function bookPosition(page: number, index: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * pageSize + Math.max(0, index);
}

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
