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

import {
  activeFieldNav,
  fieldNavFor,
  fieldStartTab,
  fieldTabsFor,
  phoneRoleOf,
  type FieldNavKey,
} from "@/lib/field-nav";

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

describe("each phone its own buttons (JB104, 客户 11-05 事项 9)", () => {
  it("keeps site staff's four and adds 沟通", () => {
    // 「现场工作人员手机端 保留原有现场工作功能，包括门岗页面及沟通功能」.
    expect(fieldNavFor("site_staff")).toEqual(["home", "attendance", "records", "hazards", "talk"]);
    expect(fieldNavFor("site_staff")).not.toContain("operate");
  });

  it("gives the operator 设备操作 and 沟通 only", () => {
    expect(fieldNavFor("equipment_operator")).toEqual(["operate", "talk"]);
  });

  it("gives the guard 拍照 and 沟通 only", () => {
    expect(fieldNavFor("gate_guard")).toEqual(["records", "talk"]);
  });

  it("lets a link open only the tabs that phone has", () => {
    expect(fieldTabsFor("equipment_operator")).toEqual(["operate", "talk"]);
    expect(fieldTabsFor("gate_guard")).toEqual(["records", "talk"]);
    expect(fieldTabsFor("site_staff")).toEqual(
      expect.arrayContaining(["home", "tasks", "attendance", "records", "incidents", "talk"]),
    );
    expect(fieldTabsFor("site_staff")).not.toContain("operate");
    expect(fieldStartTab("site_staff")).toBe("home");
    expect(fieldStartTab("equipment_operator")).toBe("operate");
    expect(fieldStartTab("gate_guard")).toBe("records");
  });

  it("treats an account the server says nothing about as the full phone", () => {
    // A server from before JB104, and every pilot account: nobody loses a page.
    expect(phoneRoleOf({})).toBe("site_staff");
    expect(phoneRoleOf(null)).toBe("site_staff");
    expect(phoneRoleOf({ phone_role: null })).toBe("site_staff");
    expect(phoneRoleOf({ phone_role: "gate_guard" })).toBe("gate_guard");
    expect(phoneRoleOf({ phone_role: "equipment_operator" })).toBe("equipment_operator");
  });

  it("lights 沟通 and 设备操作 for their own tabs", () => {
    expect(activeFieldNav("talk", null)).toBe("talk");
    expect(activeFieldNav("operate", null)).toBe("operate");
    // The guard's 拍照 is the gate form inside the records tab.
    expect(activeFieldNav("records", "gate")).toBe("records");
  });
});

describe("the bottom navigation reads one answer", () => {
  const source = readFileSync(WORKSPACE, "utf8");

  it("renders the buttons of the phone's own list and no other", () => {
    const buttons = source.match(/<MobileNavButton\b/g) ?? [];
    // One button, drawn once per key of `fieldNavFor` (JB104). A second,
    // hand-placed button would be a page some phone should not have.
    expect(buttons).toHaveLength(1);
    expect(source).toMatch(/navKeys\.map\(\(key\) => \(\s*<MobileNavButton/);
    expect(source).toMatch(/const navKeys = fieldNavFor\(phoneRole\)/);
  });

  it("matches the grid to the number of buttons", () => {
    for (const role of ["site_staff", "equipment_operator", "gate_guard"] as const) {
      expect(source).toContain(`${fieldNavFor(role).length}: "grid-cols-${fieldNavFor(role).length}"`);
    }
  });

  it("gives every button its state from activeFieldNav", () => {
    const predicates = [...source.matchAll(/<MobileNavButton\s+key=\{key\}\s+active=\{([^}]*)\}/g)]
      .map((match) => match[1].trim());
    expect(predicates).toEqual(["activeNav === key"]);
  });

  it("no longer offers 位置", () => {
    expect(source).not.toContain('openTab("location")');
  });

  it("asks activeFieldNav for that answer", () => {
    expect(source).toMatch(/const activeNav = activeFieldNav\(/);
  });
});
