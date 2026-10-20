/**
 * 只能从分类管理下拉选 (J14-3, Q14-2): material and specification come from
 * Category Management's lists; words are typed only under 「其他材料」 /
 * 「其他」. The rule, and every form that names a material keeping to it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { typedWords } from "@/lib/material-catalogue";
import type { MaterialSpec } from "@/interfaces/contractor-ops";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const spec = (id: string, name: string, extra: Partial<MaterialSpec> = {}) =>
  ({ id, name, default_unit: "TONNE", is_active: true, is_other: false, sort_order: 0, ...extra }) as MaterialSpec;

const concrete = { id: "m1", name: "Concrete", specs: [spec("s1", "G15"), spec("s9", "其他", { is_other: true, default_unit: "" })] };

describe("typedWords", () => {
  it("names a listed material and specification from the list", () => {
    expect(typedWords(concrete, "s1")).toEqual({ name: false, spec: false });
  });

  it("types the specification only under 「其他」", () => {
    expect(typedWords(concrete, "s9")).toEqual({ name: false, spec: true });
  });

  it("types the material only under 「其他材料」", () => {
    expect(typedWords({ ...concrete, is_other: true }, "s1").name).toBe(true);
  });

  it("lets a material with no specifications, or an old record filed nowhere, keep its words", () => {
    expect(typedWords({ id: "m2", name: "Sand", specs: [] }, "")).toEqual({ name: false, spec: true });
    expect(typedWords(null, "")).toEqual({ name: true, spec: true });
  });
});

describe("the forms", () => {
  it("the phone's delivery opens no material column and types a name only under 「其他材料」", () => {
    const phone = read("src/components/field-staff/field-records-panel.tsx");
    expect(phone).not.toContain("createMaterialColumn");
    expect(phone).toContain('t("material.otherName")');
    expect(phone).toContain("selectedColumn?.is_other && !selectedColumn.parent");
  });

  it("the office's correction reads the words from the chosen material", () => {
    const office = read("src/components/receipts/create-receipt.tsx");
    expect(office).toContain("typedWords(material, specCategory)");
    expect(office).toMatch(/words\.name \? \(\s*<form\.Field\s+name="material_name"/);
  });

  it("MR and the material exit type a name only under 「其他材料」", () => {
    expect(read("src/components/material-requests/request-form.tsx")).toContain(
      "...(material?.is_other ? { material_name: typedMaterial.trim() } : {})",
    );
    expect(read("src/components/contractor-ops/operations-workspaces.tsx")).toContain(
      "const typedMaterial = Boolean(selected?.is_other && !selected.parent);",
    );
  });
});
