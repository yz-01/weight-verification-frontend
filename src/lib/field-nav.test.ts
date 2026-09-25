/**
 * One tap, one lit button.
 *
 * The customer photographed two bottom-navigation buttons lit at once after a
 * single tap on 隐患 (F-374). The cause was not a rendering glitch: 拍照 and
 * 隐患 each decided for themselves whether they were the current screen, and
 * the hazard form lives inside the 拍照 tab, so both predicates were true.
 *
 * So this file tests two different things on purpose. The first half pins the
 * answer for every screen the workspace can be on. The second half reads the
 * workspace source and refuses to let a button go back to computing its own
 * state - without it, somebody could reintroduce exactly the old shape and
 * every test below would still pass, because the function they test would no
 * longer be the thing the screen uses.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { activeFieldNav, type FieldNavKey } from "@/lib/field-nav";

const WORKSPACE = "src/components/field-staff/field-staff-workspace.tsx";

describe("activeFieldNav", () => {
  it("lights exactly one button for every reachable screen", () => {
    const screens: Array<[string, string | null, FieldNavKey]> = [
      ["home", null, "home"],
      ["tasks", null, "home"],
      ["attendance", null, "attendance"],
      ["records", null, "records"],
      ["records", "material", "records"],
      // 「位置」 is gone (T-321). An unknown tab must fall back to 首页 rather
      // than light nothing, which is what a stale deep link now produces.
      ["location", null, "home"],
      ["incidents", null, "hazards"],
    ];
    for (const [tab, mode, expected] of screens) {
      expect(activeFieldNav(tab, mode), `${tab}/${mode}`).toBe(expected);
    }
  });

  it("gives the hazard form to 隐患, not to 拍照", () => {
    // This is the customer's tap: `openRecord("safety")` sets the tab to
    // "records" and the mode to "safety" in the same breath.
    expect(activeFieldNav("records", "safety")).toBe("hazards");
    expect(activeFieldNav("records", "safety")).not.toBe("records");
  });

  it("keeps the conversation on 隐患 as well", () => {
    // Reading a hazard after reporting it is still 隐患 - the tab the worker
    // is in should not change under them when the room opens.
    expect(activeFieldNav("incidents", null)).toBe("hazards");
    expect(activeFieldNav("incidents", "safety")).toBe("hazards");
  });
});

describe("the bottom navigation reads one answer", () => {
  const source = readFileSync(WORKSPACE, "utf8");

  it("renders four buttons and no more", () => {
    const buttons = source.match(/<MobileNavButton\b/g) ?? [];
    // Four since 「位置」 was removed (T-321, customer item 43). Pinned here
    // because the grid column count has to match it.
    expect(buttons).toHaveLength(4);
  });

  it("gives every button its state from activeFieldNav", () => {
    const predicates = [...source.matchAll(/<MobileNavButton\s+active=\{([^}]*)\}/g)]
      .map((match) => match[1].trim());
    expect(predicates).toHaveLength(4);
    for (const predicate of predicates) {
      // `activeNav === "records"` and nothing else. A predicate that mentions
      // `tab` or `recordMode` is a button deciding for itself again.
      expect(predicate, predicate).toMatch(/^activeNav === "[a-z]+"$/);
    }
  });

  it("no longer offers 位置", () => {
    expect(source).not.toContain('openTab("location")');
  });

  it("asks activeFieldNav for that answer", () => {
    expect(source).toMatch(/const activeNav = activeFieldNav\(/);
  });
});
