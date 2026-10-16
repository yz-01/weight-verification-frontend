import { describe, expect, it } from "vitest";

import { registerMachineCategory } from "@/lib/category-modules";

describe("registerMachineCategory (I38)", () => {
  it("preselects a sub class", () => {
    expect(registerMachineCategory({ id: "sub-1", depth: 1 })).toBe("sub-1");
  });
  it("leaves a major class unselected", () => {
    expect(registerMachineCategory({ id: "major-1", depth: 0 })).toBeNull();
  });
});
