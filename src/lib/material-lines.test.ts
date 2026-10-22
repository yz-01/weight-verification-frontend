import { describe, expect, it } from "vitest";

import type { MaterialSpec } from "@/interfaces/contractor-ops";
import {
  draftsFromReceiptLines,
  emptyLine,
  lineProblems,
  linesMoneyNote,
  receiptLinesPayload,
  requestLinesPayload,
  trimQuantity,
  type CatalogueRow,
} from "@/lib/material-lines";

function spec(id: string, name: string, unit: string, extra: Partial<MaterialSpec> = {}): MaterialSpec {
  return {
    id,
    code: id,
    name,
    default_unit: unit,
    default_unit_label: null,
    is_active: true,
    is_other: false,
    is_fixed: false,
    sort_order: 0,
    ...extra,
  };
}

const rebar: CatalogueRow = {
  id: "rebar",
  name: "钢筋",
  default_unit: "TONNE",
  specs: [spec("y12", "Y12", "TONNE"), spec("rebar-other", "其他", "", { is_other: true, is_fixed: true })],
};
const other: CatalogueRow = { id: "other", name: "其他材料", is_fixed: true, default_unit: "", specs: [spec("other-other", "其他", "", { is_other: true })] };
const materials = [rebar, other];

describe("材料明细 (J35)", () => {
  it("names a listed line from the material data and takes the specification's unit", () => {
    const line = { ...emptyLine(), category: "rebar", spec_category: "y12", quantity: "2.5" };
    expect(lineProblems(line, materials)).toEqual([]);
    expect(receiptLinesPayload([line], materials)).toEqual([
      {
        category: "rebar",
        spec_category: "y12",
        material_name: "钢筋",
        material_specification: "Y12",
        quantity: "2.5",
        unit: "TONNE",
        unit_price: null,
        amount: null,
      },
    ]);
    expect(requestLinesPayload([line], materials)).toEqual([
      { category: "rebar", spec_category: "y12", quantity: "2.5" },
    ]);
  });

  it("types the name under 其他材料 and the specification and unit under 其他 (J14)", () => {
    const line = {
      ...emptyLine(),
      category: "other",
      spec_category: "other-other",
      material_name: " 防水卷材 ",
      specification: "3mm",
      unit: "M2",
      quantity: "40",
    };
    expect(lineProblems(line, materials)).toEqual([]);
    expect(requestLinesPayload([line], materials)).toEqual([
      { category: "other", spec_category: "other-other", material_name: "防水卷材", specification: "3mm", unit: "M2", quantity: "40" },
    ]);
    const missing = { ...line, material_name: "", specification: "", unit: "", quantity: "0" };
    expect(lineProblems(missing, materials)).toEqual(["materialName", "specificationName", "quantity", "unit"]);
  });

  it("asks for the material and specification of a new line", () => {
    expect(lineProblems({ ...emptyLine(), quantity: "1" }, materials)).toContain("material");
    expect(lineProblems({ ...emptyLine(), category: "rebar", quantity: "1" }, materials)).toEqual(["specification", "unit"]);
  });

  it("starts from a delivery's stored lines and sends their ids back", () => {
    const drafts = draftsFromReceiptLines([
      {
        id: "l1", position: 1, category: "rebar", category_code: "MAT-RB", category_name: "钢筋", spec_category: "y12",
        spec_category_name: "Y12", material_name: "钢筋", material_specification: "Y12", quantity: "18.500", unit: "TONNE",
        unit_label: null, unit_price: "12.00", amount: null, total_value: null,
      },
    ]);
    expect(drafts[0].quantity).toBe("18.5");
    const [payload] = receiptLinesPayload(drafts, materials);
    expect(payload).toMatchObject({ id: "l1", quantity: "18.5", unit_price: "12.00", material_specification: "Y12" });
  });

  it("keeps a stored line whose material was switched off since", () => {
    const [draft] = draftsFromReceiptLines([
      {
        id: "l2", position: 2, category: "gone", category_code: null, category_name: "旧材料", spec_category: null,
        spec_category_name: null, material_name: "旧材料", material_specification: "A", quantity: "1.000", unit: "BAG",
        unit_label: null, unit_price: null, amount: null, total_value: null,
      },
    ]);
    expect(lineProblems(draft, materials, { stored: true })).toEqual([]);
    expect(receiptLinesPayload([draft], materials)[0]).toMatchObject({ material_name: "旧材料", material_specification: "A", unit: "BAG" });
  });

  it("shows a quantity without trailing zeros", () => {
    expect(trimQuantity("10.000")).toBe("10");
    expect(trimQuantity("2.500")).toBe("2.5");
    expect(trimQuantity("7")).toBe("7");
  });
});

describe("the money note on several materials (audit 10-22)", () => {
  it("says nothing for one material", () => {
    expect(linesMoneyNote([{ amount: "" }])).toBeNull();
  });
  it("puts the DO amount on material 1 when no material has an amount", () => {
    expect(linesMoneyNote([{ amount: "" }, { amount: " " }])).toBe("moneyOnFirst");
  });
  it("says only the typed amounts count once one has an amount", () => {
    expect(linesMoneyNote([{ amount: "" }, { amount: "300" }])).toBe("moneyPerLine");
  });
});
