/**
 * JB232 (客户 2026-11-20 事项 4, 图 4): material totals per material name +
 * specification + unit, never per unit alone.
 *
 * 「即使单位相同，只要材料名称或规格不同，也不能直接相加。请按照『材料名称＋规格
 * ＋单位』分别统计累计数量。」 The PDF block 「累计数量（按单位分别统计）」 added
 * different materials in one unit; so did the material report's per-unit
 * figures and the 报表 page's unit headings.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";
import { cardQuantityText, materialLineLabel, unitsOf } from "@/lib/material-totals";
import { exportBody, materialUnitSummary } from "@/services/contractor.service";

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const unitName = (unit: string) => ({ TONNE: "吨", M3: "m³" })[unit] ?? unit;

describe("material lines are worded with their specification", () => {
  it("names the specification, or the material alone without one", () => {
    expect(materialLineLabel({ material_name: "混凝土", material_specification: "G25" })).toBe("混凝土 G25");
    expect(materialLineLabel({ material_name: "Grout", material_specification: "" })).toBe("Grout");
    expect(materialLineLabel({ material_name: "Grout", material_specification: null })).toBe("Grout");
  });

  it("a card lists each material line on its own, never one figure per unit", () => {
    const text = cardQuantityText(
      [
        { material_name: "混凝土", material_specification: "G15", unit: "M3", quantity: "2" },
        { material_name: "混凝土", material_specification: "G25", unit: "M3", quantity: "3" },
      ],
      unitName,
    );
    expect(text).toBe("混凝土 G15 2 m³, 混凝土 G25 3 m³");
    expect(text).not.toContain("5 m³");
    expect(cardQuantityText([], unitName)).toBe("0");
  });

  it("groups bars by unit without a total of the unit", () => {
    expect(unitsOf([{ unit: "TONNE" }, { unit: "M3" }, { unit: "TONNE" }])).toEqual(["TONNE", "M3"]);
  });
});

describe("the material lists' export block is per material, specification and unit", () => {
  const t = (key: string) => `[${key}]`;

  it("asks the server for material_unit with every label", () => {
    const body = exportBody({
      format: "pdf",
      title: "材料退场",
      columns: [],
      query: {},
      summary: materialUnitSummary(t, "单位"),
    });
    expect(body.summary).toEqual({
      group_by: "material_unit",
      title: "[exportTotals.materialTitle]",
      unit_label: "单位",
      quantity_label: "[exportTotals.quantity]",
      count_label: "[exportTotals.records]",
      note: "[exportTotals.materialNote]",
      material_label: "[exportTotals.material]",
      specification_label: "[exportTotals.specification]",
      no_spec_label: "[exportTotals.noSpec]",
      no_unit_label: "[exportTotals.noUnit]",
    });
  });

  it("is what 材料退场, 材料出场 and the receipts' other tabs send; equipment and waste keep 按单位", () => {
    const office = read("src/components/contractor-ops/office-module-lists.tsx");
    const outgoing = office.slice(office.indexOf("exportMaterialOutgoing({"));
    expect(outgoing.slice(0, outgoing.indexOf("});"))).toContain("materialUnitSummary(tRoot");
    const equipment = office.slice(office.indexOf("exportEquipmentMovements({"));
    expect(equipment.slice(0, equipment.indexOf("});"))).toContain('groupBy: "unit"');

    const site = read("src/components/contractor-ops/operations-workspaces.tsx");
    const siteExport = site.slice(site.indexOf("exportMaterialOutgoing({"));
    expect(siteExport.slice(0, siteExport.indexOf("});"))).toContain("materialUnitSummary(tRoot");

    const receipts = read("src/components/receipts/receipts.tsx");
    expect(receipts).toContain('materialUnitSummary(t, t("receipts.field.unit"))');
    expect(receipts).not.toContain('groupBy: "unit"');

    const waste = read("src/components/contractor-ops/waste-outgoing-workspace.tsx");
    expect(waste).toContain('groupBy: "unit"');
  });

  it("says the rule in all four languages", () => {
    expect(zh.exportTotals.materialTitle).toBe("累计数量（按材料、规格、单位分别统计）");
    expect(zh.exportTotals.materialNote).toBe(
      "只有材料名称、规格和单位都相同的记录才累计；不同材料或不同规格分开列出，不按单位合计总数。",
    );
    expect(zh.exportTotals.noSpec).toBe("（无规格）");
    expect(zh.exportTotals.noUnit).toBe("（无单位）");
    for (const messages of [en, zh, zhTW, ms]) {
      for (const key of ["materialTitle", "materialNote", "material", "specification", "records", "noSpec", "noUnit"] as const) {
        expect(messages.exportTotals[key]).toBeTruthy();
      }
    }
  });
});

describe("no screen adds different materials because they share a unit", () => {
  it("the material report shows no per-unit figures and its cards name each material line", () => {
    const source = read("src/components/reports/material-report.tsx");
    expect(source).not.toContain("by_unit");
    expect(source).toContain("cardQuantityText(card.by_material, unitName)");
  });

  it("the 报表 page's unit sections have no total, and each bar names its specification", () => {
    const source = read("src/components/reports/reports.tsx");
    expect(source).not.toContain("by_unit");
    expect(source).not.toContain("{unit.quantity}");
    expect(source).toContain("label: materialLineLabel(material)");
  });

  it("the 材料领用 totals and a mixed category column list each material line", () => {
    expect(read("src/components/contractor-ops/issue-statement.tsx")).toContain("materialLineLabel(row)");
    const column = read("src/components/contractor-ops/column-records.tsx");
    expect(column).toContain("data.materials?.length");
    expect(column).toContain("materialLineLabel(row)");
  });
});
