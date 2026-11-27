/**
 * JB261 / JB275 (客户 11-26 事项 2、16): the unit price comes from 材料分类 the
 * moment a material and specification are chosen, empties when there is none,
 * follows another material or specification, and a price typed after that
 * is the person's.
 *
 * 事项 16: 「选择材料名称及规格后，如果材料分类中已设定对应单价，系统应立即自动显示
 * 单价，无需人工重复填写。」「如未设定单价，则保留空白，允许人工填写。」「更换材料
 * 名称或规格时，单价必须同步更新，避免沿用之前材料的单价，导致成本计算错误。」
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lineCost } from "@/components/shared/material-lines";
import type { ListPriceOnDay, MaterialSpec } from "@/interfaces/contractor-ops";
import {
  changesWhatIsPriced,
  draftsFromReceiptLines,
  emptyLine,
  listPriceFor,
  receiptLinesPayload,
  withListPrice,
  type CatalogueRow,
  type MaterialLineDraft,
} from "@/lib/material-lines";

const price = (unit_price: string, unit = "TONNE", effective_from = "2026-11-01"): ListPriceOnDay => ({
  unit_price,
  unit,
  unit_label: "",
  effective_from,
});

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
    list_price: null,
    list_price_later: null,
    ...extra,
  };
}

// 图 23 / 图 24: 钢筋 Y32 2580, Y20 2580, Y12 2680; Disel per Liter (图 4 / 图 5).
const rebar: CatalogueRow = {
  id: "rebar",
  name: "钢筋",
  default_unit: "TONNE",
  list_price: price("2580.00"),
  list_price_later: null,
  specs: [
    spec("y32", "Y32", "TONNE"),
    spec("y20", "Y20", "TONNE"),
    spec("y12", "Y12", "TONNE", { list_price: price("2680.00") }),
    spec("y10", "Y10", "PIECE", { list_price: price("12.00", "TONNE") }),
    spec("rebar-other", "其他", "", { is_other: true, is_fixed: true }),
  ],
};
const sand: CatalogueRow = {
  id: "sand",
  name: "砂石",
  default_unit: "TONNE",
  list_price: null,
  list_price_later: price("650.00", "TONNE", "2026-12-01"),
  specs: [spec("fine", "细砂", "TONNE")],
};
const diesel: CatalogueRow = {
  id: "diesel",
  name: "Disel",
  default_unit: "LITER",
  list_price: price("6.70", "LITER"),
  list_price_later: null,
  specs: [spec("diesel-other", "其他", "", { is_other: true, is_fixed: true })],
};
const unpriced: CatalogueRow = {
  id: "cement",
  name: "水泥",
  default_unit: "BAG",
  list_price: null,
  list_price_later: null,
  specs: [spec("opc", "OPC", "BAG")],
};
// Read without a delivery, or by a reader without 金额查看: no prices at all.
const noPrices: CatalogueRow = { id: "brick", name: "砖", default_unit: "PIECE", specs: [spec("red", "红砖", "PIECE")] };
const materials = [rebar, sand, diesel, unpriced, noPrices];

const line = (patch: Partial<MaterialLineDraft>): MaterialLineDraft => ({ ...emptyLine(), ...patch });

describe("listPriceFor - the same choice as the server's resolve (JB275)", () => {
  it("takes the specification's own price, else the material's", () => {
    expect(listPriceFor(rebar, "y12", "TONNE")).toMatchObject({ known: true, price: "2680.00" });
    expect(listPriceFor(rebar, "y32", "TONNE")).toMatchObject({ known: true, price: "2580.00" });
    // 「其他」 has no price of its own: the material's.
    expect(listPriceFor(rebar, "rebar-other", "TONNE")).toMatchObject({ known: true, price: "2580.00" });
  });

  it("takes nothing in another unit, and says so", () => {
    // 图 4: Disel per Liter, the delivery in 吨.
    expect(listPriceFor(diesel, "diesel-other", "TONNE")).toMatchObject({ known: true, price: null, why: "unit" });
    expect(listPriceFor(diesel, "diesel-other", "LITER")).toMatchObject({ price: "6.70" });
    // A specification priced in another unit does not hand over the material's.
    expect(listPriceFor(rebar, "y10", "PIECE")).toMatchObject({ price: null, why: "unit" });
  });

  it("says when a price only starts later, or none is set", () => {
    expect(listPriceFor(sand, "fine", "TONNE")).toMatchObject({ price: null, why: "later" });
    expect(listPriceFor(unpriced, "opc", "BAG")).toMatchObject({ price: null, why: "none" });
  });

  it("waits for the unit, and knows nothing without prices", () => {
    expect(listPriceFor(rebar, "", "")).toMatchObject({ known: true, price: null, why: null });
    expect(listPriceFor(noPrices, "red", "PIECE")).toEqual({ known: false });
    expect(listPriceFor(undefined, "", "TONNE")).toEqual({ known: false });
  });
});

describe("withListPrice - the box follows the material (事项 16)", () => {
  it("shows the price as soon as material and specification are chosen", () => {
    const chosen = withListPrice(line({ category: "rebar", spec_category: "y12" }), materials);
    expect(chosen.unit_price).toBe("2680.00");
    expect(chosen.unit_price_typed).toBe(false);
  });

  it("leaves the box empty when no price is set", () => {
    expect(withListPrice(line({ category: "cement", spec_category: "opc", unit_price: "" }), materials).unit_price).toBe("");
  });

  it("never keeps the old material's price - typed or not", () => {
    // 图 23: Y32 at 2580 typed by hand, changed to Y12 → 2680, not 2580.
    const typed = line({ category: "rebar", spec_category: "y12", unit_price: "2580.00", unit_price_typed: true });
    expect(withListPrice(typed, materials)).toMatchObject({ unit_price: "2680.00", unit_price_typed: false });
    // Changed to a material with no price: empty, not the old number.
    const moved = line({ category: "cement", spec_category: "opc", unit_price: "2580.00" });
    expect(withListPrice(moved, materials).unit_price).toBe("");
    // Material chosen, specification not yet: nothing to show yet.
    expect(withListPrice(line({ category: "rebar", unit_price: "2580.00" }), materials).unit_price).toBe("");
  });

  it("empties the box when the form has no prices (the server fills it on save)", () => {
    expect(withListPrice(line({ category: "brick", spec_category: "red", unit_price: "1.00" }), materials).unit_price).toBe("");
  });

  it("only a material, specification or unit change moves the price", () => {
    expect(changesWhatIsPriced({ category: "x" })).toBe(true);
    expect(changesWhatIsPriced({ spec_category: "x" })).toBe(true);
    expect(changesWhatIsPriced({ unit: "BAG" })).toBe(true);
    expect(changesWhatIsPriced({ quantity: "3" })).toBe(false);
    expect(changesWhatIsPriced({ unit_price: "3" })).toBe(false);
  });
});

describe("what is sent", () => {
  it("says a price was typed after choosing, so the server keeps it", () => {
    const rows = receiptLinesPayload(
      [
        line({ category: "rebar", spec_category: "y12", quantity: "45", unit_price: "2600", unit_price_typed: true }),
        line({ category: "rebar", spec_category: "y32", quantity: "100", unit_price: "2580.00" }),
      ],
      materials,
    );
    expect(rows[0]).toMatchObject({ unit_price: "2600", unit_price_typed: true });
    expect(rows[1]).not.toHaveProperty("unit_price_typed");
    expect(rows[1].unit_price).toBe("2580.00");
  });

  it("a stored line starts untyped", () => {
    const [draft] = draftsFromReceiptLines([
      {
        id: "l1", position: 1, category: "rebar", spec_category: "y32", material_name: "钢筋",
        material_specification: "Y32", quantity: "100.000", unit: "TONNE", unit_price: "2580.00", amount: null,
      } as never,
    ]);
    expect(draft.unit_price_typed).toBeFalsy();
  });
});

describe("成本 = 数量 × 单价 (事项 2 第 2 点)", () => {
  it("is worked out from the price shown", () => {
    expect(lineCost("100", "2580.00")).toBe("258,000.00");
    expect(lineCost("45", "2680.00")).toBe("120,600.00");
    expect(lineCost("45", "")).toBeNull();
  });
});

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the forms use it (source)", () => {
  const editor = read("src/components/shared/material-lines.tsx");
  const dialog = read("src/components/receipts/receipt-lines-dialog.tsx");
  const correction = read("src/components/receipts/create-receipt.tsx");

  it("修改材料明细 refills the price on a material, specification or unit change, and marks typing", () => {
    expect(editor).toContain("money && changesWhatIsPriced(patch) ? withListPrice(next, materials) : next");
    expect(editor).toContain("update(line.key, { unit_price: event.target.value, unit_price_typed: true })");
    expect(editor).toContain("data-line-cost");
    expect(editor).toContain("useMaterialCatalogue(project, receipt)");
    expect(dialog).toContain("receipt={receipt.id}");
    expect(dialog).toContain('useMaterialCatalogue(receipt.project ?? "", receipt.id)');
  });

  it("更正材料进场记录 does the same", () => {
    expect(correction).toContain('useMaterialCatalogue(receipt.project ?? "", receipt.id)');
    expect(correction).toContain('form.setFieldValue("unit_price", next)');
    expect(correction).toMatch(/if \(moved\) fillPrice\(\);/);
    expect(correction).toContain('listeners={{ onChange: () => fillPrice() }}');
    expect(correction).toContain("unit_price_typed: true");
  });
});

describe("the words, in four languages", () => {
  const keys = ["priceFromList", "priceNone", "priceOtherUnit", "priceLater", "priceTyped", "pickFirst"];
  for (const lang of ["zh", "zh-TW", "en", "ms"]) {
    it(lang, () => {
      const group = JSON.parse(read(`src/messages/${lang}.json`)).jb275 as Record<string, string>;
      for (const key of keys) expect(group[key], `${lang}.jb275.${key}`).toBeTruthy();
      expect(group.priceFromList).toContain("{price}");
      expect(group.priceOtherUnit).toContain("{unit}");
      expect(group.priceLater).toContain("{date}");
    });
  }

  it("speaks 你, never 您", () => {
    for (const lang of ["zh", "zh-TW"]) {
      expect(JSON.stringify(JSON.parse(read(`src/messages/${lang}.json`)).jb275)).not.toContain("您");
    }
  });
});
