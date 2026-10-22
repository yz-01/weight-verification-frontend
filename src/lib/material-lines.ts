/**
 * 「材料明细」: the materials of one MI or one MR (J35, 「+ 增加材料」).
 *
 * The client (10-22): 「一张DO来货里面有三种材料，不同规格，后台更改以后材料分类各自
 * 归档。MR也是需要申请几种材料」. One delivery or request, several lines; each
 * line picks its material and specification from the project's material data
 * (I19) - 「其他材料」 / 「其他」 typed (J14) - and has its own quantity and
 * unit. The phone still files one material; these lines are the office's.
 *
 * Plain functions with no React in them, so vitest can hold the rules the
 * shared `MaterialLinesEditor` follows for both forms.
 */

import { isValidRequestQuantity, type MaterialRequestLine } from "@/interfaces/material-request";
import type { MaterialReceiptLine } from "@/interfaces/contractor";
import { isOtherMaterial, specChoice, type MaterialWithSpecs, type OtherMaterialFlags } from "@/lib/material-catalogue";

/** One line as the editor holds it. */
export interface MaterialLineDraft {
  /** A stable key for React; never sent. */
  key: string;
  /** The stored line's id; absent on a line added here. */
  id?: string | null;
  category: string;
  spec_category: string;
  /** Typed only under 「其他材料」; otherwise the material's own name. */
  material_name: string;
  /** Typed only under 「其他」; otherwise the specification's own name. */
  specification: string;
  quantity: string;
  /** Chosen only under 「其他」; otherwise the specification's unit. */
  unit: string;
  unit_price: string;
  amount: string;
  /** The words a stored line already carries, shown when its material is
   *  no longer offered (switched off since). */
  known_material?: string;
  known_spec?: string;
}

export type CatalogueRow = MaterialWithSpecs & OtherMaterialFlags;

let counter = 0;
export function newLineKey(): string {
  counter += 1;
  return `line-${Date.now().toString(36)}-${counter}`;
}

export function emptyLine(): MaterialLineDraft {
  return {
    key: newLineKey(),
    id: null,
    category: "",
    spec_category: "",
    material_name: "",
    specification: "",
    quantity: "",
    unit: "",
    unit_price: "",
    amount: "",
  };
}

/** A delivery's stored lines as the editor starts from them. */
export function draftsFromReceiptLines(lines: readonly MaterialReceiptLine[]): MaterialLineDraft[] {
  return lines.map((line) => ({
    key: line.id ?? newLineKey(),
    id: line.id,
    category: line.category ?? "",
    spec_category: line.spec_category ?? "",
    material_name: line.material_name ?? "",
    specification: line.material_specification ?? "",
    quantity: trimQuantity(line.quantity),
    unit: line.unit ?? "",
    unit_price: line.unit_price ?? "",
    amount: line.amount ?? "",
    known_material: line.material_name ?? "",
    known_spec: line.material_specification ?? "",
  }));
}

/** 「18.500」 as 「18.5」, for an input a person edits. */
export function trimQuantity(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

/** What the line means once its material and specification are looked up. */
export function resolveLine(line: MaterialLineDraft, materials: readonly CatalogueRow[]) {
  const material = materials.find((row) => row.id === line.category) ?? null;
  const choice = specChoice(material, line.spec_category);
  const hasSpecs = (material?.specs ?? []).some((spec) => !spec.is_other);
  // A material with no specifications to choose from (an old one) keeps its
  // own unit and a typed specification, as on the correction form.
  const typedSpec = choice.typed || (Boolean(material) && !hasSpecs) || (!material && !line.category);
  const unit = choice.unitLocked ? choice.unit : line.unit || (material && !hasSpecs ? material.default_unit ?? "" : "");
  const name = isOtherMaterial(material) || (!material && !line.category)
    ? line.material_name.trim()
    : material?.name ?? line.known_material ?? line.material_name;
  const specification = typedSpec
    ? line.specification.trim()
    : choice.spec?.name ?? line.known_spec ?? line.specification;
  return { material, choice, hasSpecs, typedSpec, unit, name, specification };
}

/** Which parts of a line still need filling, by field (empty when complete). */
export function lineProblems(
  line: MaterialLineDraft,
  materials: readonly CatalogueRow[],
  { stored = false }: { stored?: boolean } = {},
): Array<"material" | "materialName" | "specification" | "specificationName" | "quantity" | "unit"> {
  const resolved = resolveLine(line, materials);
  const problems: Array<"material" | "materialName" | "specification" | "specificationName" | "quantity" | "unit"> = [];
  // A stored line whose material was switched off since keeps it.
  if (!line.category && !(stored && line.material_name.trim())) problems.push("material");
  if (isOtherMaterial(resolved.material) && !line.material_name.trim()) problems.push("materialName");
  if (resolved.hasSpecs && !line.spec_category && !stored) problems.push("specification");
  if (resolved.choice.typed && !line.specification.trim()) problems.push("specificationName");
  if (!isValidRequestQuantity(line.quantity)) problems.push("quantity");
  if (!resolved.unit) problems.push("unit");
  return problems;
}

/** The body of `save_receipt_lines` (MI): every line, in order. */
export function receiptLinesPayload(lines: readonly MaterialLineDraft[], materials: readonly CatalogueRow[]) {
  return lines.map((line) => {
    const resolved = resolveLine(line, materials);
    return {
      ...(line.id ? { id: line.id } : {}),
      category: line.category || null,
      spec_category: line.spec_category || null,
      material_name: resolved.name,
      material_specification: resolved.specification,
      quantity: line.quantity.replace(/,/g, "").trim(),
      unit: resolved.unit,
      unit_price: line.unit_price.trim() || null,
      amount: line.amount.trim() || null,
    };
  });
}

/** The `lines` of `create_request` (MR): material data only, the server names them. */
export function requestLinesPayload(lines: readonly MaterialLineDraft[], materials: readonly CatalogueRow[]) {
  return lines.map((line) => {
    const resolved = resolveLine(line, materials);
    return {
      category: line.category,
      spec_category: line.spec_category,
      ...(isOtherMaterial(resolved.material) ? { material_name: line.material_name.trim() } : {}),
      ...(resolved.choice.typed ? { specification: line.specification.trim(), unit: resolved.unit } : {}),
      quantity: line.quantity.replace(/,/g, "").trim(),
    };
  });
}

/** A delivery's lines as the table and the chip show them. */
export function receiptShownLines(receipt: { lines?: readonly MaterialReceiptLine[] }) {
  return (receipt.lines ?? []).map((line) => ({
    position: line.position,
    material_name: line.material_name,
    specification: line.material_specification || line.spec_category_name || "",
    quantity: line.quantity,
    unit: line.unit,
    unit_label: line.unit_label,
    unit_price: line.unit_price,
    amount: line.amount,
  }));
}

/** A request's lines as the table and the chip show them (J35). */
export function requestShownLines(request: { lines?: readonly MaterialRequestLine[] }) {
  return (request.lines ?? []).map((line) => ({
    position: line.position,
    material_name: line.material_name,
    specification: line.specification,
    quantity: line.quantity,
    unit: line.unit,
  }));
}
