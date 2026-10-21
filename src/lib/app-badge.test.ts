/**
 * J4: the installed app's icon carries the bell's number, cleared at zero, and
 * a browser without the Badging API is simply skipped.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { setAppBadgeCount } from "@/lib/app-badge";

const original = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
});

function withBadging() {
  const setAppBadge = vi.fn(() => Promise.resolve());
  const clearAppBadge = vi.fn(() => Promise.resolve());
  Object.defineProperty(globalThis, "navigator", { value: { setAppBadge, clearAppBadge }, configurable: true });
  return { setAppBadge, clearAppBadge };
}

describe("the home-screen icon's number (J4)", () => {
  it("shows the bell's number", () => {
    const badging = withBadging();
    setAppBadgeCount(7);
    expect(badging.setAppBadge).toHaveBeenCalledWith(7);
    expect(badging.clearAppBadge).not.toHaveBeenCalled();
  });

  it("clears at zero", () => {
    const badging = withBadging();
    setAppBadgeCount(0);
    expect(badging.clearAppBadge).toHaveBeenCalled();
    expect(badging.setAppBadge).not.toHaveBeenCalled();
  });

  it("skips a browser without the Badging API", () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    expect(() => setAppBadgeCount(3)).not.toThrow();
  });
});
