import { afterEach, describe, expect, it } from "vitest";

import {
  ignoreSelectClose,
  watchViewportHeightChanges,
  type ViewportHeightWatch,
} from "@/lib/viewport-height-change";

/**
 * A phone tap on a select used to open its list and close it again (Lucas,
 * 2026-10-09, 材料进场 「材料分类」): Radix Select closes on every window
 * `resize`, and the tap itself changes a phone's viewport height (iOS toolbar,
 * keyboard going down). These pin the rule the shared `Select` now follows.
 */

class FakeWindow extends EventTarget {
  innerWidth = 390;
  timers: (() => void)[] = [];
  setTimeout = (handler: () => void) => {
    this.timers.push(handler);
    return this.timers.length;
  };
  /** The page changes size, as the browser would dispatch it. */
  resize(width: number) {
    this.innerWidth = width;
    this.dispatchEvent(new Event("resize"));
  }
  runTimers() {
    const pending = this.timers;
    this.timers = [];
    pending.forEach((handler) => handler());
  }
}

/** Radix's own listener: registered when the list opens, i.e. after the watch. */
function openSelect(win: FakeWindow, watch: ViewportHeightWatch) {
  const state = { open: true };
  win.addEventListener("resize", () => {
    if (!ignoreSelectClose(false, watch)) state.open = false;
  });
  return state;
}

describe("a select on a phone and the viewport changing size", () => {
  let watch: ViewportHeightWatch | undefined;
  afterEach(() => watch?.dispose());

  it("stays open when only the height changes (toolbar, keyboard)", () => {
    const win = new FakeWindow();
    watch = watchViewportHeightChanges(win);
    const select = openSelect(win, watch);

    win.resize(390);

    expect(select.open).toBe(true);
  });

  it("still closes on a real resize: the width changed (rotation)", () => {
    const win = new FakeWindow();
    watch = watchViewportHeightChanges(win);
    const select = openSelect(win, watch);

    win.resize(664);

    expect(select.open).toBe(false);
  });

  it("refuses a close only during that resize, not a later one by the person", () => {
    const win = new FakeWindow();
    watch = watchViewportHeightChanges(win);
    win.resize(390);
    expect(ignoreSelectClose(false, watch)).toBe(true);

    win.runTimers();

    // An option chosen, a tap outside, Esc: these close it as before.
    expect(ignoreSelectClose(false, watch)).toBe(false);
  });

  it("never refuses an open", () => {
    const win = new FakeWindow();
    watch = watchViewportHeightChanges(win);
    win.resize(390);

    expect(ignoreSelectClose(true, watch)).toBe(false);
  });

  it("measures each width against the one before it", () => {
    const win = new FakeWindow();
    watch = watchViewportHeightChanges(win);
    win.resize(664); // rotated
    win.runTimers();
    const select = openSelect(win, watch);

    win.resize(664); // toolbar in landscape

    expect(select.open).toBe(true);
  });

  it("without a browser window there is nothing to refuse", () => {
    expect(ignoreSelectClose(false, null)).toBe(false);
  });
});
