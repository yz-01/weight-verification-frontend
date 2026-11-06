import { describe, expect, it } from "vitest";

import { landingPathFor } from "@/lib/navigation";

const holding = (...codes: string[]) => (code: string) => codes.includes(code);

describe("where a sign-in lands", () => {
  it("sends a phone account to the phone", () => {
    expect(landingPathFor(holding("field_position.submit"), true)).toBe("/field-staff");
  });

  it("keeps an office account on the back office even when it holds the phone's codes", () => {
    // A project manager on the switch page (JB114 check, 11-06).
    expect(landingPathFor(holding("field_position.submit", "project.view"), false)).toBe("/dashboard");
  });

  it("decides from permissions alone when an older server does not say", () => {
    expect(landingPathFor(holding("field_position.submit"))).toBe("/field-staff");
    expect(landingPathFor(holding("field_position.submit", "project.view_all"))).toBe("/dashboard");
  });

  it("sends a driver to the driver page", () => {
    expect(landingPathFor(holding("task.view", "task.submit"), false)).toBe("/driver");
  });
});
