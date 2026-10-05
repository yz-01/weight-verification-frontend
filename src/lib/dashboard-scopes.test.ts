import { describe, expect, it } from "vitest";

import { DASHBOARD_SCOPES, legacyDashboardTarget } from "@/lib/dashboard-scopes";

describe("the two dashboard levels (C11)", () => {
  it("puts the company first, at the home page", () => {
    expect(DASHBOARD_SCOPES.map((scope) => [scope.key, scope.href])).toEqual([
      ["company", "/dashboard"],
      ["project", "/dashboard/project"],
    ]);
  });

  it("forwards the old project dashboard address to its new place", () => {
    expect(legacyDashboardTarget("?project=p1")).toBe("/dashboard/project?project=p1");
    expect(legacyDashboardTarget("?scope=project")).toBe("/dashboard/project");
    expect(legacyDashboardTarget("?scope=project&project=p1")).toBe(
      "/dashboard/project?project=p1",
    );
  });

  it("stays on the company level otherwise", () => {
    expect(legacyDashboardTarget("")).toBeNull();
    expect(legacyDashboardTarget("?scope=company")).toBe("/dashboard");
  });
});
