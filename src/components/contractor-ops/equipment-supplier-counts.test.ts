import { describe, expect, it } from "vitest";

import { countsQuery, headlineOf } from "@/components/contractor-ops/equipment-supplier-counts";
import type { EquipmentSupplierCounts } from "@/interfaces/contractor-ops";

const data: EquipmentSupplierCounts = {
  by_project: true,
  on_site: 5,
  total: 9,
  results: [
    { supplier: "s1", supplier_name: "ABC Rental", project: "p1", project_name: "A", on_site: 2, total: 3 },
    { supplier: "s1", supplier_name: "ABC Rental", project: "p2", project_name: "B", on_site: 1, total: 2 },
    { supplier: "s2", supplier_name: "XYZ", project: "p1", project_name: "A", on_site: 2, total: 2 },
    { supplier: null, supplier_name: null, project: "p1", project_name: "A", on_site: 0, total: 2 },
  ],
};

describe("headlineOf", () => {
  it("counts everything when no supplier is chosen", () => {
    expect(headlineOf(data, undefined)).toMatchObject({ chosen: false, onSite: 5, total: 9 });
  });

  it("sums one supplier over its projects", () => {
    expect(headlineOf(data, "s1")).toMatchObject({ supplier: "ABC Rental", chosen: true, onSite: 3, total: 5 });
  });

  it("counts the machines with no supplier", () => {
    expect(headlineOf(data, "none")).toMatchObject({ noSupplier: true, onSite: 0, total: 2 });
  });

  it("is zero for a supplier with no machines", () => {
    expect(headlineOf(data, "s9")).toMatchObject({ chosen: false, onSite: 0, total: 0 });
  });
});

describe("countsQuery", () => {
  it("keeps the project, class and search but not the supplier, 在场状态 or page", () => {
    expect(
      countsQuery({ project: "p1", category: "c", search: "x", supplier: "s1", presence: "on", page: 3, sort_by: "code" }),
    ).toEqual({ project: "p1", category: "c", search: "x" });
  });
});
