import { describe, expect, it } from "vitest";

import {
  approvesPermitsWithoutSeeingProjects,
  withProjectView,
} from "@/lib/role-permission-hints";

/**
 * The client's 「安全经理」: Safety view, manage and verify, and nobody holding
 * it could be picked to approve a permit (I32). The role editor warns while
 * the boxes are being ticked, and adds 查看项目 in one click.
 */
describe("the permit-approver hint in the role editor", () => {
  it("warns about the client's role exactly as they built it", () => {
    expect(
      approvesPermitsWithoutSeeingProjects(["safety.view", "safety.manage", "safety.verify"]),
    ).toBe(true);
  });

  it("is quiet once the role can see projects, or cannot approve at all", () => {
    expect(approvesPermitsWithoutSeeingProjects(["safety.verify", "project.view"])).toBe(false);
    expect(approvesPermitsWithoutSeeingProjects(["safety.view", "safety.manage"])).toBe(false);
    expect(approvesPermitsWithoutSeeingProjects([])).toBe(false);
  });

  it("adds 查看项目 once, keeping the list sorted", () => {
    const fixed = withProjectView(["safety.verify", "safety.view"]);
    expect(fixed).toEqual(["project.view", "safety.verify", "safety.view"]);
    expect(approvesPermitsWithoutSeeingProjects(fixed)).toBe(false);
    expect(withProjectView(fixed)).toEqual(fixed);
  });
});
