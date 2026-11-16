import { describe, expect, it } from "vitest";

import { isRouteAllowed, navLeaves, visibleNavigation } from "./navigation";
import { helpKeyFor } from "./page-help";

/**
 * JB207 (Lucas 11-16 audit): menu entries that bounced.
 *
 * The rule, as `navigation.test.ts` states it for features: what the menu
 * shows must open. Feature lists below are what `accounts/portal_features.py`
 * hands each role template (MSE_SCRAP) or a contractor office account
 * (MSE_TRACE).
 */

/** Every page the menu shows this person, headings left out. */
function menuPages(
  portal: "MSE_SCRAP" | "MSE_TRACE",
  features: string[],
  permissions: string[] = [],
): string[] {
  return visibleNavigation(portal, features, permissions).flatMap((group) =>
    group.items.flatMap((item) =>
      item.children?.length ? navLeaves(item.children).map((leaf) => leaf.href) : [item.href],
    ),
  );
}

// recycler `weighbridge_operator`: fleet.view, scale.view, weighing.view,
// dispatch.view, task.view(+_all), customer, inventory, settlement.view - no
// yard.view, so no `yards`.
const OPERATOR = [
  "dashboard",
  "customer_management",
  "weighbridges",
  "vehicles",
  "drivers",
  "waste_orders",
  "driver_tasks",
  "driver_gps",
  "weighing_records",
  "inventory_management",
  "payment_status",
  "notifications",
];
const OPERATOR_PERMISSIONS = [
  "fleet.view",
  "fleet.set_tare",
  "scale.view",
  "weighing.view",
  "weighing.operate",
  "settlement.view",
];

// A 标准版 company admin: everything but what the plan drops
// (`weighbridges`, `weighing_records`; get_portal_features).
const STANDARD_ADMIN = [
  "dashboard",
  "partnerships",
  "customer_management",
  "yards",
  "vehicles",
  "drivers",
  "waste_orders",
  "driver_tasks",
  "driver_gps",
  "inventory_management",
  "outbound_management",
  "payment_status",
  "billing_commission",
  "transaction_reports",
  "notifications",
  "users",
  "roles",
  "company_settings",
];

describe("JB207-3: a recycler reaches every page its menu shows", () => {
  it("lets the weighbridge operator open 车辆 and 司机 (设定皮重)", () => {
    expect(menuPages("MSE_SCRAP", OPERATOR, OPERATOR_PERMISSIONS)).toEqual(
      expect.arrayContaining(["/vehicles", "/drivers", "/scales", "/settlements"]),
    );
    for (const route of ["/vehicles", "/vehicles/abc", "/drivers", "/drivers/abc"]) {
      expect(isRouteAllowed("MSE_SCRAP", OPERATOR, route, OPERATOR_PERMISSIONS), route).toBe(true);
    }
    // Still not the 回收场 list it was never given.
    expect(isRouteAllowed("MSE_SCRAP", OPERATOR, "/sites", OPERATOR_PERMISSIONS)).toBe(false);
  });

  it("lets a 标准版 recycler open 付款状态", () => {
    expect(menuPages("MSE_SCRAP", STANDARD_ADMIN)).toContain("/settlements");
    expect(isRouteAllowed("MSE_SCRAP", STANDARD_ADMIN, "/settlements")).toBe(true);
    expect(isRouteAllowed("MSE_SCRAP", STANDARD_ADMIN, "/settlements/abc")).toBe(true);
    // The plan's own refusals stand: no weighbridge, no weighing.
    expect(isRouteAllowed("MSE_SCRAP", STANDARD_ADMIN, "/scales")).toBe(false);
    expect(isRouteAllowed("MSE_SCRAP", STANDARD_ADMIN, "/weighing")).toBe(false);
  });

  it("opens every page the menu shows, for both", () => {
    for (const [features, permissions] of [
      [OPERATOR, OPERATOR_PERMISSIONS],
      [STANDARD_ADMIN, []],
    ] as const) {
      for (const page of menuPages("MSE_SCRAP", [...features], [...permissions])) {
        expect(
          isRouteAllowed("MSE_SCRAP", [...features], page.split("?", 1)[0], [...permissions]),
          page,
        ).toBe(true);
      }
    }
  });

  it("still refuses each page to a role without its feature", () => {
    // A recycler dispatcher's features less fleet / payment / weighbridges.
    const without = ["dashboard", "yards", "weighing_records", "waste_orders"];
    for (const route of ["/vehicles", "/drivers", "/settlements", "/scales"]) {
      expect(isRouteAllowed("MSE_SCRAP", without, route), route).toBe(false);
    }
    // The parent alone used to open them.
    expect(isRouteAllowed("MSE_SCRAP", ["yards"], "/vehicles")).toBe(false);
    expect(isRouteAllowed("MSE_SCRAP", ["weighing_records"], "/settlements")).toBe(false);
  });

  it("keeps the action rules on the pages beneath", () => {
    expect(isRouteAllowed("MSE_SCRAP", OPERATOR, "/vehicles/abc/edit", OPERATOR_PERMISSIONS)).toBe(false);
    expect(
      isRouteAllowed("MSE_SCRAP", OPERATOR, "/vehicles/abc/edit", [...OPERATOR_PERMISSIONS, "fleet.manage"]),
    ).toBe(true);
  });

  it("puts each page's own help on it", () => {
    expect(helpKeyFor("MSE_SCRAP", "/vehicles")).toBe("vehicles");
    expect(helpKeyFor("MSE_SCRAP", "/drivers")).toBe("drivers");
    expect(helpKeyFor("MSE_SCRAP", "/settlements")).toBe("payment_status");
    expect(helpKeyFor("MSE_SCRAP", "/scales")).toBe("weighbridges");
  });
});

describe("JB207-1: the contractor opens 扣杂 from its card", () => {
  // A contractor office account holding weighing.view (recycling_records).
  const CONTRACTOR = ["dashboard", "recyclers", "waste_outgoing", "recycling_records", "payment_proofs"];

  it("opens /deductions, the 「请确认扣杂」 card's address", () => {
    expect(isRouteAllowed("MSE_TRACE", CONTRACTOR, "/deductions", ["deduction.approve"])).toBe(true);
  });

  it("keeps it out of the contractor's menu", () => {
    expect(menuPages("MSE_TRACE", CONTRACTOR)).not.toContain("/deductions");
  });

  it("still refuses 新增扣杂 and a contractor without the records", () => {
    expect(
      isRouteAllowed("MSE_TRACE", CONTRACTOR, "/deductions/create", ["deduction.approve", "deduction.view"]),
    ).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", ["dashboard", "recyclers"], "/deductions")).toBe(false);
  });

  it("carries the contractor's 回收记录 help, not the recycler's", () => {
    expect(helpKeyFor("MSE_TRACE", "/deductions")).toBe("recycling_records");
  });
});
