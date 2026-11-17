/**
 * JB213 (Lucas 11-16 「把它们真的做出来」): the package rules the screens
 * pre-fill and explain - 付款周期, 试用天数, 功能, 公开, 外部接口.
 */
import { describe, expect, it } from "vitest";

import {
  addDays,
  canSwitchOn,
  cycleMonths,
  defaultPlanId,
  featureListIsOpen,
  featureListParts,
  paidTermStart,
  pickerPlans,
  toggleFeature,
  trialEndsOn,
} from "@/lib/plan-terms";

describe("付款周期 is the default term (4a)", () => {
  it("counts months the way the server does", () => {
    expect(cycleMonths("MONTHLY")).toBe(1);
    expect(cycleMonths("QUARTERLY")).toBe(3);
    expect(cycleMonths("HALF_YEARLY")).toBe(6);
    expect(cycleMonths("YEARLY")).toBe(12);
    expect(cycleMonths(null)).toBe(1);
    expect(cycleMonths("SOMETHING_ELSE")).toBe(1);
  });
});

describe("试用天数 (4b, Q5 = A)", () => {
  it("ends on the start day plus days minus one", () => {
    expect(trialEndsOn("2026-11-16", 14)).toBe("2026-11-29");
    expect(trialEndsOn("2026-12-25", 14)).toBe("2027-01-07");
    expect(trialEndsOn("2026-11-16", 1)).toBe("2026-11-16");
  });

  it("has no end when there is no trial", () => {
    expect(trialEndsOn("2026-11-16", 0)).toBeNull();
    expect(trialEndsOn("2026-11-16", Number.NaN)).toBeNull();
  });

  it("starts the paid term after a running trial, or today once it ended", () => {
    expect(paidTermStart("2026-11-20", "2026-11-16")).toBe("2026-11-21");
    expect(paidTermStart("2026-11-10", "2026-11-16")).toBe("2026-11-16");
    expect(paidTermStart("2026-11-15", "2026-11-16")).toBe("2026-11-16");
  });

  it("does date arithmetic without drifting across months", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("功能 checklist (4e)", () => {
  const choices = ["dashboard", "yards", "weighbridges", "outbound_management"];

  it("an empty list, or one with no known menu, is everything", () => {
    expect(featureListIsOpen([], choices)).toBe(true);
    expect(featureListIsOpen(["old_free_text"], choices)).toBe(true);
    expect(featureListIsOpen(["yards"], choices)).toBe(false);
  });

  it("keeps keys typed before it was a checklist instead of dropping them", () => {
    expect(featureListParts(["yards", "old_free_text"], choices)).toEqual({
      checked: ["yards"],
      legacy: ["old_free_text"],
    });
    expect(toggleFeature(["old_free_text"], "outbound_management", true, choices)).toEqual([
      "outbound_management",
      "old_free_text",
    ]);
  });

  it("ticks in menu order and unticks cleanly", () => {
    const ticked = toggleFeature(toggleFeature([], "weighbridges", true, choices), "yards", true, choices);
    expect(ticked).toEqual(["yards", "weighbridges"]);
    expect(toggleFeature(ticked, "yards", false, choices)).toEqual(["weighbridges"]);
  });
});

describe("公开 in the pickers (4g) and the default package (1c)", () => {
  const plans = [
    { id: "basic", audience: "CONTRACTOR" as const, is_active: true, is_public: true },
    { id: "secret", audience: "CONTRACTOR" as const, is_active: true, is_public: false },
    { id: "stopped", audience: "CONTRACTOR" as const, is_active: false, is_public: true },
    { id: "pro", audience: "CONTRACTOR" as const, is_active: true, is_public: true, is_default: true },
    { id: "partner", audience: "RECYCLER" as const, is_active: true, is_public: true, is_default: false },
  ];

  it("offers active public packages of the company's audience", () => {
    expect(pickerPlans(plans, "CONTRACTOR").map((plan) => plan.id)).toEqual(["basic", "pro"]);
    expect(pickerPlans(plans, "RECYCLER").map((plan) => plan.id)).toEqual(["partner"]);
  });

  it("keeps the hidden or stopped package a company is already on", () => {
    expect(pickerPlans(plans, "CONTRACTOR", "secret").map((plan) => plan.id)).toEqual(["basic", "secret", "pro"]);
    expect(pickerPlans(plans, "CONTRACTOR", "stopped").map((plan) => plan.id)).toEqual(["basic", "stopped", "pro"]);
  });

  it("pre-selects the default package for a contractor, never for a recycler", () => {
    expect(defaultPlanId(plans, "CONTRACTOR")).toBe("pro");
    expect(defaultPlanId(plans, "RECYCLER")).toBe("");
    expect(defaultPlanId(plans, "")).toBe("");
  });
});

describe("外部接口 switch (4f)", () => {
  it("lets a connection outside the package be switched off but not on", () => {
    expect(canSwitchOn({ is_enabled: true, outside_plan: true })).toBe(true);
    expect(canSwitchOn({ is_enabled: false, outside_plan: true })).toBe(false);
    expect(canSwitchOn({ is_enabled: false, outside_plan: false })).toBe(true);
    expect(canSwitchOn({ is_enabled: false })).toBe(true);
  });
});
