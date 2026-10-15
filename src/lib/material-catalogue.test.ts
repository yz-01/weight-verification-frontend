import { describe, expect, it } from "vitest";

import type { MaterialSpec } from "@/interfaces/contractor-ops";
import {
  categoryManagementLink,
  materialLine,
  materialNotSetUp,
  matchesMaterial,
  offeredSpecs,
  specChoice,
} from "@/lib/material-catalogue";

/**
 * I19 (ID45, ID46): material → specification → unit, one list for MR,
 * deliveries, returns and targets. The unit comes with the specification;
 * 「其他」 is typed with its unit chosen.
 */

const spec = (fields: Partial<MaterialSpec> & Pick<MaterialSpec, "id" | "name">): MaterialSpec => ({
  code: "SPC-" + fields.id,
  default_unit: "TONNE",
  default_unit_label: null,
  is_active: true,
  is_other: false,
  is_fixed: false,
  sort_order: 0,
  ...fields,
});

const rebar = {
  id: "rebar",
  name: "钢筋",
  default_unit: "TONNE",
  specs: [
    spec({ id: "other", name: "其他", default_unit: "", is_other: true, is_fixed: true, sort_order: 9999 }),
    spec({ id: "y16", name: "Y16", sort_order: 1 }),
    spec({ id: "y12", name: "Y12", sort_order: 0 }),
    spec({ id: "y40", name: "Y40mm", sort_order: 2, is_active: false }),
  ],
};

describe("the specifications a form offers (I19-8)", () => {
  it("lists the switched-on ones in order, 「其他」 last", () => {
    expect(offeredSpecs(rebar).map((row) => row.name)).toEqual(["Y12", "Y16", "其他"]);
  });

  it("keeps a switched-off one that is already chosen, so an old record still shows it", () => {
    expect(offeredSpecs(rebar, "y40").map((row) => row.name)).toEqual(["Y12", "Y16", "Y40mm", "其他"]);
  });

  it("offers nothing before a material is chosen", () => {
    expect(offeredSpecs(null)).toEqual([]);
  });
});

describe("the unit comes with the specification (I19-5, I19-9)", () => {
  it("locks the unit to a named specification's", () => {
    expect(specChoice(rebar, "y12")).toMatchObject({ typed: false, unit: "TONNE", unitLocked: true });
  });

  it("asks for the specification and the unit when 「其他」 is chosen", () => {
    expect(specChoice(rebar, "other")).toMatchObject({ typed: true, unit: "", unitLocked: false });
  });

  it("decides nothing before a specification is chosen", () => {
    expect(specChoice(rebar, "")).toEqual({ spec: null, typed: false, unit: "", unitLocked: false });
    expect(specChoice(rebar, "gone")).toEqual({ spec: null, typed: false, unit: "", unitLocked: false });
  });
});

describe("「该材料尚未建立」 (I19-11, I19-12)", () => {
  const materials = [rebar, { id: "concrete", name: "混凝土 Ready Mix" }];

  it("matches ignoring case and spaces", () => {
    expect(matchesMaterial("混凝土 Ready Mix", "readymix")).toBe(true);
    expect(matchesMaterial("钢筋", "铝板")).toBe(false);
  });

  it("says so only when something was typed and nothing matches", () => {
    expect(materialNotSetUp(materials, "铝板")).toBe(true);
    expect(materialNotSetUp(materials, "钢")).toBe(false);
    expect(materialNotSetUp(materials, "  ")).toBe(false);
  });

  it("opens the material categories of this project", () => {
    expect(categoryManagementLink("p-1")).toBe("/category-management?module=material&project=p-1");
    expect(categoryManagementLink("")).toBe("/category-management?module=material");
  });
});

describe("a material's line", () => {
  it("reads 「钢筋 · Y12」, or the material alone", () => {
    expect(materialLine("钢筋", "Y12")).toBe("钢筋 · Y12");
    expect(materialLine("钢筋", null)).toBe("钢筋");
  });
});
