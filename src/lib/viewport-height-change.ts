/**
 * Tells a phone's viewport "breathing" apart from a real window resize.
 *
 * Radix Select closes its list on every `window` `resize`. On a desktop that
 * is a real resize. On a phone the same event fires when only the height
 * changes, and that happens as a direct result of tapping a select:
 *
 * - iOS Safari re-expands its collapsed toolbar when the select's scroll lock
 *   lands on the page;
 * - the on-screen keyboard goes down when focus moves from a text box (the DO
 *   number, say) to the select's button.
 *
 * Either way the list opened and was closed again by the same tap, and the
 * worker had to tap twice (Lucas, 2026-10-09: 现场记录 → 材料进场 「材料分类」).
 *
 * The width is what tells the two apart: a toolbar or a keyboard changes only
 * the height, a rotation or a desktop window drag changes the width.
 */

/** The parts of `window` this needs, so a test can hand in a stand-in. */
export interface ViewportWindow {
  innerWidth: number;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
  setTimeout: (handler: () => void, timeout?: number) => unknown;
}

export interface ViewportHeightWatch {
  /** True only while a `resize` that left the width alone is being dispatched. */
  heightOnlyResizeInProgress(): boolean;
  dispose(): void;
}

export function watchViewportHeightChanges(win: ViewportWindow): ViewportHeightWatch {
  let width = win.innerWidth;
  let heightOnly = false;
  const onResize = () => {
    heightOnly = win.innerWidth === width;
    width = win.innerWidth;
    // Cleared once this dispatch is over. Not a microtask: those run between
    // listeners, before the select's own listener has asked.
    if (heightOnly) win.setTimeout(() => { heightOnly = false; }, 0);
  };
  // Capture, and registered before any select opens, so this runs before the
  // select's own `resize` listener on the same event.
  win.addEventListener("resize", onResize, true);
  return {
    heightOnlyResizeInProgress: () => heightOnly,
    dispose: () => win.removeEventListener("resize", onResize, true),
  };
}

let pageWatch: ViewportHeightWatch | null = null;

/** The page's one watch, started on first use in the browser. */
export function pageViewportHeightWatch(): ViewportHeightWatch | null {
  if (typeof window === "undefined") return null;
  pageWatch ??= watchViewportHeightChanges(window);
  return pageWatch;
}

/**
 * Whether a select's request to close should be ignored: it came from the
 * phone's viewport changing height, not from the person.
 */
export function ignoreSelectClose(
  nextOpen: boolean,
  watch: ViewportHeightWatch | null = pageViewportHeightWatch(),
): boolean {
  return !nextOpen && Boolean(watch?.heightOnlyResizeInProgress());
}
