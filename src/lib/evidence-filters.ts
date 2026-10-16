/**
 * The 关联现场证据 filters (I40): the server lists what the project's evidence
 * has, as tables (`site_operations.safetyincident`); the person reads module
 * names. One module name can stand for several tables (a module's photos and
 * its files), so they are folded into one choice whose value is the tables
 * joined with a comma - the form `get_evidence_candidates?module=` takes.
 */

export interface CountedOption {
  value: string;
  count: number;
}

export interface ModuleChoice {
  /** The message key under `consultantWorkflow.evidence.moduleName`. */
  key: string;
  /** The tables, comma-joined: what the server filters on. */
  value: string;
  count: number;
}

const MODULE_OF: Record<string, string> = {
  "contractor_ops.fieldtaskphoto": "fieldTask",
  "contractor_ops.equipmentmovementphoto": "equipment",
  "contractor_ops.siteprogressphoto": "progress",
  "site_operations.progressupdate": "progress",
  "contractor_ops.disposalevidence": "disposal",
  "contractor_ops.wasteoutgoingphoto": "wasteOut",
  "waste.dispatchphoto": "wasteDispatch",
  "receiving.receiptphoto": "materialIn",
  "receiving.deliverynoteevidence": "materialIn",
  "contractor_ops.materialoutgoingphoto": "materialOut",
  "site_operations.safetyincident": "hazard",
  "site_operations.safetyrectificationevidence": "hazard",
  "site_operations.incidentreportmessage": "hazard",
};

/** Which module name a table is shown under; anything unknown is 「其他」. */
export function moduleKeyOf(sourceModel: string): string {
  return MODULE_OF[sourceModel] ?? "other";
}

/** The server's tables folded into one choice per module name, biggest first. */
export function groupModules(options: readonly CountedOption[]): ModuleChoice[] {
  const groups = new Map<string, { values: string[]; count: number }>();
  for (const option of options) {
    const key = moduleKeyOf(option.value);
    const group = groups.get(key) ?? { values: [], count: 0 };
    group.values.push(option.value);
    group.count += option.count;
    groups.set(key, group);
  }
  return Array.from(groups, ([key, group]) => ({ key, value: group.values.join(","), count: group.count })).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );
}

/** The sub-categories of the chosen category; none when no category is chosen. */
export function subcategoriesOf(
  categories: readonly { value: string; subcategories: readonly CountedOption[] }[],
  category: string,
): readonly CountedOption[] {
  return categories.find((row) => row.value === category)?.subcategories ?? [];
}
