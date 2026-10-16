import { readFileSync } from "node:fs";
import path from "node:path";

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

describe("登记设备 permission (I38)", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/contractor-ops/category-management.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  it("the header button needs equipment.manage alone", () => {
    expect(source).toMatch(/const registerButton = active\.key === "equipment" && can\("equipment\.manage"\) && \(/);
    expect(source).not.toMatch(/active\.key === "equipment" && canManage \?/);
  });
  it("the row button sits outside the category.manage block", () => {
    const row = source.indexOf('registerMachineCategory(row) && can("equipment.manage")');
    const gate = source.indexOf("{canManage && (\n                          <div");
    expect(row).toBeGreaterThan(0);
    expect(row).toBeLessThan(gate);
  });
});
