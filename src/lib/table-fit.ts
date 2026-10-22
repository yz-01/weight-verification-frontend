/**
 * Back-office lists fit the screen (I39, ID80).
 *
 * Lucas 2026-10-16: 「尽量把所有table缩成可以看完全部资料包括更改/查看，就是
 * 不需要往右边滑」. On a 1366 px wide desktop every list shows all of its
 * default columns and its 「查看 / 更改」 without a sideways scroll. In order:
 * columns sized by their content, long text on two lines at most (then 「…」
 * and the whole text on hover), secondary details stacked under the main
 * one, tight padding with nothing under 13 px, the actions pinned at the
 * right - and, when a list still does not fit, its less used columns hidden
 * by default and still offered under 「字段」. No column is removed.
 *
 * The layout itself is CSS (`[data-fit]` in globals.css). What lives here is
 * the arithmetic the guard test checks every list against, and the two small
 * pieces of behaviour the shared table needs: the default column choice and
 * the hover text of a clipped cell.
 */

/** The narrowest desktop the client works on. */
export const FIT_SCREEN_PX = 1366;

/**
 * The width a list's table has on that screen: less the 16rem sidebar, the
 * page's 24 px gutters, the panel's border and the table's own scrollbar.
 */
export const FIT_TABLE_PX = FIT_SCREEN_PX - 256 - 2 * 24 - 2 - 12;

/** 8 px a side in a fitted table (`padding-inline: .5rem`). */
export const FIT_CELL_PADDING_PX = 16;

/**
 * What one column needs at its narrowest, in px of content, by what it shows.
 * A text column's figure is where two lines start reading badly; a column
 * that never wraps (a badge, a thumbnail, a button) needs its full width.
 * Each is also at least as wide as a typical header, which stays on one line.
 */
export const FIT_KIND_PX = {
  /** A record number: the short number, the copy button, the project under. */
  recno: 88,
  /** Date over time, 「08/10/2026」 / 「01:19 下午」. */
  datetime: 80,
  date: 76,
  /** The 48 px photo thumbnail. */
  thumb: 48,
  /**
   * A row's photo strip (J34-2): four 64 px squares, 4 px apart (Lucas
   * 10-21: 64 px on a desktop, 56 px on a phone).
   */
  strip: 268,
  /** A short pill: 进场 / 退场, a type. */
  badge: 60,
  /** A status pill, one line, up to 「已批准，待交接签名」. */
  status: 128,
  /** The main name, wrapping, with its code or plate under it. */
  name: 112,
  /** Other free text: supplier, project, remarks, wrapping. */
  text: 96,
  /** A quantity with its unit, an amount, a percentage. */
  number: 72,
  /** A person's name, wrapping. */
  person: 72,
  /** A short code, a plate, a unit, a yes / no. */
  short: 60,
  /** 「✅ 已打包 2 次」. */
  pack: 84,
  /** 「待处理」 by the row's buttons. */
  marker: 56,
  /** A small outlined button with a word: 「查看」, 「PDF」. */
  button: 68,
  /** The pinned eye / pencil at the end of the row. */
  actions: 36,
  /** A tick box. */
  select: 20,
} as const;

export type FitKind = keyof typeof FIT_KIND_PX;

/** One back-office list, as the fit check sees it. */
export interface ListFit {
  /** Where it keeps the reader's own column choice (`mse.columns.<key>`). */
  storageKey: string;
  /** The component that draws it, for the guard test. */
  file: string;
  /** Every column it can show, in order, and what it shows. */
  columns: Record<string, FitKind>;
  /** Hidden until the reader turns them on under 「字段」. */
  hidden: readonly string[];
  /**
   * On a phone, cards instead of the table (J34-2 point 4): the title
   * columns, the detail columns under them, and the photo strip.
   */
  phoneCard?: {
    title: readonly string[];
    detail: readonly string[];
    photo?: string;
  };
}

/** How wide a list's visible columns need to be, padding included. */
export function fitWidth(
  columns: Record<string, FitKind>,
  hidden: readonly string[] = [],
): number {
  return Object.entries(columns)
    .filter(([id]) => !hidden.includes(id))
    .reduce((sum, [, kind]) => sum + FIT_KIND_PX[kind] + FIT_CELL_PADDING_PX, 0);
}

/** A list's default visibility: its hidden columns off, the rest as they are. */
export function defaultVisibility(hidden: readonly string[] = []): Record<string, boolean> {
  return Object.fromEntries(hidden.map((id) => [id, false]));
}

/**
 * The column choice a table starts with: the reader's own when they saved
 * one (it is kept as it is), else the list's defaults. A saved value that
 * cannot be read is dropped and the defaults apply.
 */
export function initialVisibility(
  stored: string | null,
  hidden: readonly string[] = [],
): { visibility: Record<string, boolean>; corrupt: boolean } {
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { visibility: parsed as Record<string, boolean>, corrupt: false };
      }
    } catch {
      // fall through to the defaults
    }
    return { visibility: defaultVisibility(hidden), corrupt: true };
  }
  return { visibility: defaultVisibility(hidden), corrupt: false };
}

/** The bits of an element `clippedText` reads; a DOM element has them all. */
export interface ClipBox {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  innerText?: string;
  textContent: string | null;
  querySelectorAll?: (selector: string) => ArrayLike<ClipBox>;
}

function clipped(box: ClipBox): boolean {
  return box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
}

/**
 * The whole text of a cell when part of it is cut off - by the two-line
 * clamp or by a `truncate` inside it - so the hover tip shows it; `null`
 * when everything is already on screen.
 */
export function clippedText(box: ClipBox): string | null {
  const cut =
    clipped(box) ||
    Array.from(box.querySelectorAll?.("*") ?? []).some((child) => clipped(child));
  if (!cut) return null;
  const text = (box.innerText ?? box.textContent ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}
