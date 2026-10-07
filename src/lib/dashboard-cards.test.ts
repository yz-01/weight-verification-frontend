import { describe, expect, it } from "vitest";

import {
  approvalsListHref,
  attendanceRecordHref,
  cardListHref,
  DASHBOARD_CARDS,
} from "@/lib/dashboard-cards";
import { legacyDashboardTarget } from "@/lib/dashboard-scopes";

/*
 * The parameters below are the ones `contractor_ops.tests.test_dashboard_cards`
 * reads each list with, so a card's number is the count of the list it opens.
 */
describe("project dashboard cards (B8, F6)", () => {
  const date = "2026-10-07";

  it("has six cards in the order the client listed them (Q6)", () => {
    expect(DASHBOARD_CARDS).toEqual([
      "waiting",
      "approvals",
      "rectifications",
      "receipts",
      "attendance",
      "safety",
    ]);
  });

  it("opens each card's list with the filter its number was counted by", () => {
    const scope = { project: "p1", date };
    expect(cardListHref("waiting", scope)).toBe("/archive-queue?waiting=1&project=p1");
    expect(cardListHref("approvals", scope)).toBe(
      "/dashboard?work=approvals&work_project=p1#headquarters-work",
    );
    expect(cardListHref("rectifications", scope)).toBe(
      "/hazard-rectifications?waiting=me&project=p1",
    );
    expect(cardListHref("receipts", scope)).toBe(
      "/receipts?date_from=2026-10-07&date_to=2026-10-07&project=p1",
    );
    expect(cardListHref("attendance", scope)).toBe(
      "/attendance?date_from=2026-10-07&date_to=2026-10-07&project=p1",
    );
    expect(cardListHref("safety", scope)).toBe(
      "/hazard-rectifications?date_from=2026-10-07&date_to=2026-10-07&project=p1",
    );
  });

  it("leaves the project out when the dashboard reads every project", () => {
    expect(cardListHref("waiting", { date })).toBe("/archive-queue?waiting=1");
    expect(cardListHref("approvals", { date })).toBe(
      "/dashboard?work=approvals#headquarters-work",
    );
    expect(cardListHref("receipts", { project: "", date })).toBe(
      "/receipts?date_from=2026-10-07&date_to=2026-10-07",
    );
  });

  it("does not let the approvals link forward to the project dashboard", () => {
    const href = approvalsListHref("p1");
    const search = href.slice(href.indexOf("?") + 1, href.indexOf("#"));
    expect(legacyDashboardTarget(search)).toBeNull();
  });

  it("opens one clock event as that person's day on the attendance list", () => {
    expect(attendanceRecordHref({ user: "u1", date, project: "p1" })).toBe(
      "/attendance?date_from=2026-10-07&date_to=2026-10-07&user=u1&project=p1",
    );
  });
});
