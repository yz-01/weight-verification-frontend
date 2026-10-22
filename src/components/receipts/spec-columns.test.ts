import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LIST_FITS } from "@/lib/list-fits";

/**
 * 规格 in its own column (J2-1, J2-2, Q2-1, Q2-2): the receipt list reads
 * 「材料｜规格｜照片｜数量」; 材料出场, the material report's deliveries and
 * cost-by-material table and both its exports carry 规格 beside 材料.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("规格 columns (J2)", () => {
  it("the receipt list is 材料｜规格｜照片｜数量", () => {
    const list = read("src/components/receipts/receipts.tsx");
    const at = (needle: string) => list.indexOf(needle);
    const material = at('accessorKey: "material_name"');
    const spec = at('accessorKey: "material_specification"');
    const photo = at("photoColumn<MaterialReceipt>");
    const quantity = at('accessorKey: "quantity"');
    expect(material).toBeGreaterThan(-1);
    expect(spec).toBeGreaterThan(material);
    expect(photo).toBeGreaterThan(spec);
    expect(quantity).toBeGreaterThan(photo);
    const columns = Object.keys(LIST_FITS.materialReceipts.columns);
    expect(columns.indexOf("material_specification")).toBe(columns.indexOf("material_name") + 1);
    expect(LIST_FITS.materialReceipts.hidden).not.toContain("material_specification");
  });

  it("材料出场 has 规格 after 材料", () => {
    const list = read("src/components/contractor-ops/office-module-lists.tsx");
    const material = list.indexOf('accessorKey: "material_name"');
    const spec = list.indexOf('id: "material_specification"');
    expect(spec).toBeGreaterThan(material);
    expect(LIST_FITS.materialOutgoing.hidden).not.toContain("material_specification");
  });

  it("the material report shows and exports 规格", () => {
    const report = read("src/components/reports/material-report.tsx");
    expect(report.split('{ key: "material_specification", label: t("receipts.field.spec") }').length - 1).toBe(3);
    // Normal, cost and the returns view (J36).
    expect(report).toContain("row.material_specification || row.spec_category_name");
    expect(report).toContain("{row.material_specification || \"—\"}");
  });
});
