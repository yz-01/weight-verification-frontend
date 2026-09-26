import { describe, expect, it } from "vitest";

import { ACTIVITY_KINDS, activityHref } from "@/lib/activity-href";
import { PORTAL_NAVIGATION, isRouteAllowed } from "@/lib/navigation";

/** Every feature the contractor portal can have switched on. */
const CONTRACTOR_FEATURES = PORTAL_NAVIGATION.MSE_TRACE.flatMap((item) => [
  item.feature,
  ...(item.children ?? []).flatMap((child) => (child.feature ? [child.feature] : [])),
]);

const allowed = (href: string) =>
  isRouteAllowed("MSE_TRACE", CONTRACTOR_FEATURES, href.split("?", 1)[0], [], true);

describe("dashboard activity links", () => {
  it("open the record itself where its screen can", () => {
    expect(activityHref({ kind: "SAFETY_INCIDENT", id: "i1" })).toBe("/hazard-rectifications?incident=i1");
    expect(activityHref({ kind: "MATERIAL_OUTGOING", id: "m1" })).toBe("/material-outgoing?record=m1");
    expect(activityHref({ kind: "WASTE_DISPATCH", id: "d1" })).toBe("/dispatches/d1");
    expect(activityHref({ kind: "EQUIPMENT_MOVEMENT", id: "e1" })).toBe("/site-equipment");
    expect(activityHref({ kind: "SAFETY_INCIDENT" })).toBe("/hazard-rectifications");
  });

  // The bug: a row linked to /safety, which the route guard does not own, so
  // the click bounced straight back to the dashboard.
  it.each(ACTIVITY_KINDS)("%s leads somewhere the route guard lets a contractor in", (kind) => {
    expect(allowed(activityHref({ kind })), activityHref({ kind })).toBe(true);
    expect(allowed(activityHref({ kind, id: "x" })), activityHref({ kind, id: "x" })).toBe(true);
  });

  it("the old /safety address is the one the guard turns away", () => {
    expect(allowed("/safety")).toBe(false);
  });
});
