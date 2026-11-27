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
import type { ListPriceOnDay } from "@/interfaces/contractor-ops";
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
  /**
   * The person typed `unit_price` after the material was last chosen
   * (JB275): sent, so the server keeps it even when it is the old number.
   * Choosing another material, specification or unit clears it.
   */
  unit_price_typed?: boolean;
  amount: string;
  /** The words a stored line already carries, shown when its material is
   *  no longer offered (switched off since). */
  known_material?: string;
  known_spec?: string;
}

export type CatalogueRow = MaterialWithSpecs &
  OtherMaterialFlags & {
    /** The material's own price on the delivery's day (JB275), when the form asked for it. */
    list_price?: ListPriceOnDay | null;
    list_price_later?: ListPriceOnDay | null;
  };

/**
 * What 材料分类 says a line costs per unit (JB261 / JB275, 客户 11-26 事项 2、16:
 * 「根据材料名称及规格，自动读取分类管理中已设置的单价」「选择材料名称及规格后……
 * 系统应立即自动显示单价」).
 *
 * The same choice the server makes on save (`receiving.prices.resolve`): the
 * specification's own price in force wins - but only in its own unit; with
 * none, the material's, in its unit. Another unit takes nothing (a price per
 * Liter says nothing about tonnes). `why` says why nothing came, for the hint
 * under the box:
 *
 * - `known: false` - the material data carries no prices (a reader without
 *   金额查看, still loading, or a material no longer offered): the box is
 *   left empty and the server fills it in on save;
 * - `"unit"` - a price exists in another unit (`listed`);
 * - `"later"` - a price starts only after this delivery's day (`listed`);
 * - `"none"` - no price is set;
 * - `null` with no price - the unit is not decided yet (no specification).
 */
export type LinePrice =
  | { known: false }
  | { known: true; price: string | null; why: null | "none" | "unit" | "later"; listed: ListPriceOnDay | null };

export function listPriceFor(
  material: CatalogueRow | null | undefined,
  specId: string,
  unit: string,
): LinePrice {
  if (!material || material.list_price === undefined) return { known: false };
  const spec = (material.specs ?? []).find((row) => row.id === specId) ?? null;
  if (!unit) return { known: true, price: null, why: null, listed: null };
  const fits = (row: ListPriceOnDay): LinePrice =>
    row.unit === unit
      ? { known: true, price: row.unit_price, why: null, listed: row }
      : { known: true, price: null, why: "unit", listed: row };
  if (spec?.list_price) return fits(spec.list_price);
  if (material.list_price) return fits(material.list_price);
  const later = spec?.list_price_later ?? material.list_price_later ?? null;
  if (later) return { known: true, price: null, why: "later", listed: later };
  return { known: true, price: null, why: "none", listed: null };
}

/**
 * A line after its material, specification or unit changed (JB275, 事项 16:
 * 「更换材料名称或规格时，单价必须同步更新，避免沿用之前材料的单价」): the new
 * material's price, or an empty box - never the old one's, typed or not.
 * Typing after this is the person's (`unit_price_typed`).
 */
export function withListPrice(line: MaterialLineDraft, materials: readonly CatalogueRow[]): MaterialLineDraft {
  const resolved = resolveLine(line, materials);
  const found = listPriceFor(resolved.material, line.spec_category, resolved.unit);
  return {
    ...line,
    unit_price: found.known && found.price ? found.price : "",
    unit_price_typed: false,
  };
}

/** Whether a change to a line is one its price follows (material, specification, unit). */
export function changesWhatIsPriced(patch: Partial<MaterialLineDraft>): boolean {
  return "category" in patch || "spec_category" in patch || "unit" in patch;
}

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
/**
 * The money note a delivery's lines carry (JB167, 客户 11-11): each material
 * costs its quantity x unit price in its own category, a unit price left
 * empty comes from 材料分类, and one with no price is not in the cost. Before
 * JB167 the DO amount was the money (audit 10-22: on material 1, or each
 * line's amount); it no longer counts.
 */
export function linesMoneyNote(lines: readonly Pick<MaterialLineDraft, "amount">[]): "moneyByPrice" | null {
  return lines.length < 2 ? null : "moneyByPrice";
}

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
      // Typed after choosing the material (JB275): the person's, whatever it is.
      ...(line.unit_price_typed ? { unit_price_typed: true } : {}),
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
