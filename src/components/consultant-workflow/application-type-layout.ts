/**
 * Which fields the office's consultant application form shows for each type
 * (2026-10 C1, Q2: 「表单按类型只显示需要的字段，不要拉很长」).
 *
 * A new application is one of four types. Each shows only what that type is
 * about; everything else stays one click away under 「更多（选填）」, so
 * nothing that could be filled before is lost - it just is not in the way.
 * An older application filed under a retired type (WIR, Inspection Request…)
 * shows the whole form it was written with.
 */

export type FormGroup =
  /** The material by name (材料名称), or the item / component. */
  | "component"
  | "location"
  /** Drawing number and revision. */
  | "drawing"
  | "requiredAt"
  /** Discipline, inspection type, priority and their extra ticks. */
  | "classification"
  /** Inspection window, ITP, checklist, R/S/W/H, activity, acceptance. */
  | "inspection"
  /** The schedule activity it belongs to. */
  | "schedule";

export const ALL_GROUPS: readonly FormGroup[] = [
  "component",
  "location",
  "drawing",
  "requiredAt",
  "classification",
  "inspection",
  "schedule",
];

/** The four a new application is filed under (Q2), and what each needs. */
const FOUR: Record<string, readonly FormGroup[]> = {
  MATERIAL_APPROVAL: ["component", "location", "drawing", "requiredAt"],
  MATERIAL_CERT_SUBMISSION: ["component"],
  RFI: ["location", "drawing", "requiredAt"],
  OTHER: ["location", "requiredAt"],
};

/** 材料申请 and 材料证书提交 name their material; the server asks for it too. */
export const MATERIAL_TYPES: ReadonlySet<string> = new Set([
  "MATERIAL_APPROVAL",
  "MATERIAL_CERT_SUBMISSION",
]);

export function isMaterialType(code: string | null | undefined) {
  return Boolean(code && MATERIAL_TYPES.has(code));
}

/**
 * The groups shown in the form itself for a type code. No type chosen yet
 * reads as the shortest (「其他」's), so the form starts short.
 */
export function mainGroups(code: string | null | undefined): ReadonlySet<FormGroup> {
  if (!code) return new Set(FOUR.OTHER);
  return new Set(FOUR[code] ?? ALL_GROUPS);
}

/** The groups folded under 「更多（选填）」 for a type code. */
export function moreGroups(code: string | null | undefined): FormGroup[] {
  const main = mainGroups(code);
  return ALL_GROUPS.filter((group) => !main.has(group));
}
