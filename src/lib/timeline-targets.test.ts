import { describe, expect, it } from "vitest";

import { ACTIVITY_KINDS } from "@/lib/activity-href";
import {
  expiringPassesHref,
  geofenceBreachesHref,
  localDay,
  timelineTarget,
  timelineTone,
} from "@/lib/timeline-targets";

/**
 * E2: every timeline row opens its record; C15: the two figures that left the
 * rectification card open lists filtered the way they were counted.
 */
describe("timelineTarget", () => {
  it("opens every activity kind through the shared record route", () => {
    for (const kind of ACTIVITY_KINDS) {
      const target = timelineTarget({ kind, id: "abc", at: null });
      expect(target, kind).not.toBeNull();
    }
    expect(timelineTarget({ kind: "MATERIAL_OUTGOING", id: "m1", at: null })).toEqual({
      href: "/material-outgoing?record=m1",
    });
    // No detail page of its own: the read-only record sheet.
    expect(timelineTarget({ kind: "SITE_PROGRESS", id: "p1", at: null })).toEqual({
      sheet: "PROGRESS",
      id: "p1",
    });
  });

  it("opens an overdue rectification on the hazard itself", () => {
    expect(
      timelineTarget({ kind: "OVERDUE_RECTIFICATION", id: "h1", at: "2026-10-01T02:00:00Z" }),
    ).toEqual({ href: "/hazard-rectifications?incident=h1" });
  });

  it("opens a geofence breach on that day's out-of-fence clock-ins", () => {
    // 23:30 UTC on the 6th is the 7th in Kuala Lumpur, which is the day the
    // server's list filter compares.
    expect(
      timelineTarget({ kind: "GEOFENCE_FAILURE", id: "a1", at: "2026-10-06T23:30:00Z" }),
    ).toEqual({
      href: "/attendance?geofence_result=OUTSIDE&date_from=2026-10-07&date_to=2026-10-07",
    });
  });

  it("does not offer a click it cannot keep", () => {
    expect(timelineTarget({ kind: "SAFETY_INCIDENT", id: undefined, at: null })).toBeNull();
    expect(timelineTarget({ kind: "SOMETHING_NEW", id: "x", at: null })).toBeNull();
  });
});

describe("the moved figures' lists", () => {
  it("filters attendance to outside the fence, from the counted day", () => {
    expect(geofenceBreachesHref({ from: "2026-09-07", project: "p-1" })).toBe(
      "/attendance?geofence_result=OUTSIDE&date_from=2026-09-07&project=p-1",
    );
  });

  it("filters site passes to the ones expiring", () => {
    expect(expiringPassesHref()).toBe("/site-access?expiring=1");
    expect(expiringPassesHref("p-1")).toBe("/site-access?expiring=1&project=p-1");
  });
});

describe("timelineTone", () => {
  it("never leaves a dot grey", () => {
    expect(timelineTone("DANGER")).toBe("danger");
    expect(timelineTone("WARNING")).toBe("warning");
    expect(timelineTone("INFO")).toBe("info");
  });
});

describe("localDay", () => {
  it("takes the day in the server's zone", () => {
    expect(localDay("2026-10-06T15:59:00Z")).toBe("2026-10-06");
    expect(localDay("2026-10-06T16:00:00Z")).toBe("2026-10-07");
  });
});
