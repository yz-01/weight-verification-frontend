"use client";

import { createContext } from "react";

/**
 * True inside a list row that is itself the control - a `DataTable` row with
 * `onRowClick`, which is `role="button"`.
 *
 * Something clickable of its own inside it (a photograph's thumbnail) would be
 * a button inside a button: a screen reader announces both and Tab stops on
 * both (FABLE_AUDIT_E3 #11). A `PhotoThumb` here draws a picture only; the
 * row's own click opens the record, whose page has every photograph.
 */
export const InsideRowControl = createContext(false);

/**
 * True inside a phone card (J34-2 point 4): a photo strip there keeps the
 * phone's 56 px squares whatever the screen's width (Lucas 10-21).
 */
export const StripFillsWidth = createContext(false);

/** What inside a row has a click of its own (a copy icon, a link, a tick box). */
const INNER_CONTROLS =
  'button, a[href], input, select, textarea, label, [role="checkbox"], [role="menuitem"], [role="link"], [data-own-click]';

/**
 * Whether a click on a row (or a phone card) should open its record (Lucas
 * 2026-10-23: 「点这个卡片就可以查看，不需要一定按查看按钮」).
 *
 * Not when the click was on a control of its own inside the row, not when it
 * came from a dialog the row opened (React passes a portal's clicks up the
 * tree it was opened from), and not when the pointer was selecting text to copy.
 */
export function clickOpensRow(event: { target: EventTarget | null; currentTarget: Element }): boolean {
  const row = event.currentTarget;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !row.contains(target)) return false;
  const control = target.closest(INNER_CONTROLS);
  if (control && control !== row && row.contains(control)) return false;
  return !window.getSelection()?.toString();
}

/** Enter or Space on the row itself, not on a control inside it. */
export function keyOpensRow(event: { key: string; target: EventTarget | null; currentTarget: Element }): boolean {
  return (event.key === "Enter" || event.key === " ") && event.target === event.currentTarget;
}
