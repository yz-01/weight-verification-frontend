/**
 * The project's material data as the forms read it (I19, ID45, ID46).
 *
 * A material is a material category; its specifications are its second
 * level, each with the one unit it is measured in. Every form that names a
 * material - MR, the phone's delivery, the office's correction, a return, a
 * material target - picks the material, then the specification, and the
 * unit comes with the specification. 「其他」 is the one specification with no
 * unit of its own: whoever chooses it types the specification and picks the
 * unit.
 *
 * Plain functions with no React in them, so vitest can hold the rules.
 */

import type { MaterialSpec } from "@/interfaces/contractor-ops";

/** What a material row needs to offer here - a category or a catalogue entry. */
export interface MaterialWithSpecs {
  id: string;
  name: string;
  default_unit?: string;
  specs?: MaterialSpec[];
}

/** The specifications a form offers: switched on (or the one already chosen), 「其他」 last. */
export function offeredSpecs(material: MaterialWithSpecs | null | undefined, chosen = ""): MaterialSpec[] {
  const rows = (material?.specs ?? []).filter((spec) => spec.is_active || spec.id === chosen);
  return [...rows].sort(
    (a, b) => Number(a.is_other) - Number(b.is_other) || a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
}

/** What choosing a specification means for the rest of the form. */
export interface SpecChoice {
  spec: MaterialSpec | null;
  /** 「其他」: the specification is typed and the unit chosen. */
  typed: boolean;
  /** The unit the record will carry, when the specification decides it. */
  unit: string;
  /** Whether the unit picker is locked to that unit. */
  unitLocked: boolean;
}

export function specChoice(material: MaterialWithSpecs | null | undefined, specId: string): SpecChoice {
  const spec = material?.specs?.find((row) => row.id === specId) ?? null;
  if (!spec) {
    // No specification yet: nothing is decided. A material whose list is
    // empty (an old one never given specifications) still has its own unit.
    return { spec: null, typed: false, unit: "", unitLocked: false };
  }
  if (spec.is_other || !spec.default_unit) {
    return { spec, typed: true, unit: "", unitLocked: false };
  }
  return { spec, typed: false, unit: spec.default_unit, unitLocked: true };
}

/** What tells the project's 「其他材料」 apart. */
export interface OtherMaterialFlags {
  parent?: string | null;
  is_other?: boolean;
  is_fixed?: boolean;
}

/**
 * The project's 「其他材料」 (J14-3): the fixed top-level material (or one an
 * older project marked 「其他」) - the one material whose name is typed. The
 * server's `is_other_material`.
 */
export function isOtherMaterial(row: OtherMaterialFlags | null | undefined): boolean {
  return Boolean(row && !row.parent && (row.is_other || row.is_fixed));
}

/**
 * 只能从分类管理下拉选 (J14-3, Q14-2): which words a form may type. The
 * material's name is typed only under 「其他材料」 (or on an old record filed
 * nowhere); the specification only when 「其他」 is chosen, or when the
 * material has no specifications to choose from.
 */
export function typedWords(
  material: (MaterialWithSpecs & OtherMaterialFlags) | null | undefined,
  specId: string,
): { name: boolean; spec: boolean } {
  if (!material) return { name: true, spec: true };
  const listed = (material.specs ?? []).some((spec) => !spec.is_other);
  return {
    name: isOtherMaterial(material),
    spec: !listed || specChoice(material, specId).typed,
  };
}

/** A material whose name contains the words typed, ignoring case and spaces. */
export function matchesMaterial(name: string, term: string): boolean {
  const squash = (text: string) => text.replace(/\s+/g, "").toLocaleLowerCase();
  const wanted = squash(term);
  return !wanted || squash(name).includes(wanted);
}

/**
 * Whether the search found nothing (I19-11): 「该材料尚未建立，请先到分类管理设置。」.
 * Only once something was typed - an empty search is not a missing material.
 */
export function materialNotSetUp(materials: readonly MaterialWithSpecs[], term: string): boolean {
  return Boolean(term.trim()) && !materials.some((row) => matchesMaterial(row.name, term));
}

/**
 * Where 「前往分类管理」 opens (a new tab): the material categories of this
 * project, so the form left behind keeps what was typed.
 */
export function categoryManagementLink(project: string): string {
  const query = new URLSearchParams({ module: "material" });
  if (project) query.set("project", project);
  return `/category-management?${query.toString()}`;
}

/** 「钢筋 · Y12」, or just 「钢筋」 for a material as a whole. */
export function materialLine(material: string, spec?: string | null): string {
  return spec ? `${material} · ${spec}` : material;
}
