/**
 * FABLE_PERF_1008 #10: the bell's list follows the count instead of polling
 * beside it. What decides a refetch is checked here: a count that moved, and
 * only one that moved.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { countMoved, countSignature } from "@/components/notifications/bell-list-refresh";
import type { NotificationSummary } from "@/interfaces/platform-ops";

const summary = (overrides: Partial<NotificationSummary> = {}): NotificationSummary => ({
  total: 3,
  action: 2,
  today: 1,
  earlier: 2,
  by_kind: { HAZARD_REPORTED: 2, BUDGET_THRESHOLD: 1 } as NotificationSummary["by_kind"],
  ...overrides,
});

describe("countSignature", () => {
  it("is unknown until the count has answered", () => {
    expect(countSignature(undefined)).toBeNull();
  });

  it("does not move when only the server's order of kinds does", () => {
    const reordered = summary({
      by_kind: { BUDGET_THRESHOLD: 1, HAZARD_REPORTED: 2 } as NotificationSummary["by_kind"],
    });
    expect(countSignature(reordered)).toBe(countSignature(summary()));
  });

  it("moves when a notice arrives or is done", () => {
    expect(countSignature(summary({ total: 4, today: 2 }))).not.toBe(countSignature(summary()));
    expect(countSignature(summary({ total: 2, action: 1 }))).not.toBe(countSignature(summary()));
  });

  it("moves when one kind is done and another arrives in the same tick", () => {
    const swapped = summary({
      by_kind: { HAZARD_REPORTED: 1, BUDGET_THRESHOLD: 2 } as NotificationSummary["by_kind"],
    });
    expect(countSignature(swapped)).not.toBe(countSignature(summary()));
  });
});

describe("countMoved", () => {
  it("does not refetch on the first answer - the list loads with the page", () => {
    expect(countMoved(null, "3/2/1/")).toBe(false);
  });

  it("does not refetch while the count is unknown (a failed poll)", () => {
    expect(countMoved("3/2/1/", null)).toBe(false);
  });

  it("does not refetch on a poll that says the same", () => {
    expect(countMoved("3/2/1/", "3/2/1/")).toBe(false);
  });

  it("refetches when the count moved", () => {
    expect(countMoved("3/2/1/", "4/3/2/")).toBe(true);
  });
});

describe("the bell's list", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/notifications/notification-button.tsx"),
    "utf8",
  );
  const listQuery = source.slice(
    source.indexOf("const listQuery = useQuery("),
    source.indexOf("useRefetchWhenChanged("),
  );

  it("has no timer of its own in the office", () => {
    expect(listQuery).toContain("queryKey: BELL_LIST_KEY");
    expect(source).toContain("const listFollowsCount = !user?.is_field_staff;");
    expect(listQuery).toContain(
      "refetchInterval: listFollowsCount ? false : BELL_COUNT_POLL_MS",
    );
  });

  it("keeps its timer on the phone, whose count leaves news out", () => {
    // The phone's red dot is its to-do number (card=ACTION), so a ringing
    // news notice would never move it; following it would silence the tone.
    expect(source).toMatch(/\.\.\.\(user\?\.is_field_staff\s*\?\s*fieldTodoCountQuery/);
    expect(source).toMatch(
      /useRefetchWhenChanged\(\s*listFollowsCount \? countSignature\(countQuery\.data\) : null,\s*BELL_LIST_KEY,?\s*\)/,
    );
  });

  it("is still loaded with the page, for the pop-up cards and the alert tone", () => {
    // Fetched only while the popover is open, the cards (D-207) and the tone
    // would never see a new notice.
    expect(listQuery).toMatch(/\benabled,/);
    expect(listQuery).not.toMatch(/enabled:\s*[^,]*open/);
  });

  it("follows the count, which keeps polling", () => {
    expect(source).toContain("refetchInterval: BELL_COUNT_POLL_MS");
    expect(source).toMatch(/const BELL_COUNT_POLL_MS = 30_000;/);
  });
});
