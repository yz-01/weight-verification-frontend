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
  // JB269 (客户 11-26 事项 10, 图 12): the sources that were 「其他」 with
  // their table's name on the row - each under the module it belongs to.
  "site_operations.permitfile": "hazard",
  "contractor_ops.fieldtaskreference": "fieldTask",
  "contractor_ops.siteequipmentphoto": "equipment",
  "contractor_ops.materialrequestattachment": "materialRequest",
  "site_access.gatephoto": "gate",
  "site_access.siteaccessevent": "gate",
  "site_access.visitorarrivalphoto": "visitor",
  "site_operations.equipmentoperatinglog": "equipmentHours",
  "site_operations.attendancerecord": "attendance",
  "contractor_ops.sundryclaimattachment": "sundry",
  "contractor_ops.sundryclaimpaymentproof": "sundry",
};

/**
 * A file attached to a record (`contractor_ops.recordattachment`) is one
 * table for every module: its row is named by the record it sits on, which
 * the server sends as `record_type` (JB269).
 */
const MODULE_OF_RECORD: Record<string, string> = {
  MATERIAL_RECEIPT: "materialIn",
  DELIVERY_NOTE: "materialIn",
  MATERIAL_OUTGOING: "materialOut",
  EQUIPMENT_MOVEMENT: "equipment",
  EQUIPMENT: "equipment",
  SITE_PROGRESS: "progress",
  PROGRESS: "progress",
  PROGRESS_UPDATE: "progress",
  HAZARD: "hazard",
  SAFETY_INCIDENT: "hazard",
  FIELD_TASK: "fieldTask",
  DISPOSAL_REQUEST: "disposal",
  WASTE_OUTGOING: "wasteOut",
  WASTE_DISPATCH: "wasteDispatch",
  MATERIAL_REQUEST: "materialRequest",
  GATE_INCIDENT: "gate",
  SUNDRY_CLAIM: "sundry",
};

/** The module a picker row is named under: its table's, or its record's. */
export function rowModuleKey(row: { source_model: string; record_type?: string }): string {
  const own = moduleKeyOf(row.source_model);
  if (own !== "other") return own;
  return MODULE_OF_RECORD[row.record_type ?? ""] ?? "other";
}

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

/**
 * Where each module's name is read from: the menus' own message keys, so the
 * dropdown can never drift from what the sidebar calls the module. 「other」
 * has no menu and its own message.
 */
export const MODULE_LABEL_PATH: Record<string, string | undefined> = {
  fieldTask: "nav.submodule.fieldTasks",
  equipment: "nav.submodule.siteEquipment",
  progress: "nav.submodule.progressRecords",
  disposal: "headquarters.recordKind.DISPOSAL",
  wasteOut: "nav.submodule.wasteOutgoing",
  wasteDispatch: "nav.submodule.wasteDispatches",
  materialIn: "headquarters.recordKind.MATERIAL_RECEIPT",
  materialOut: "nav.submodule.materialOutgoing",
  hazard: "headquarters.recordKind.SAFETY_INCIDENT",
  materialRequest: "nav.submodule.materialRequests",
  gate: "nav.submodule.gateRecords",
  visitor: "nav.submodule.visitorRecords",
  equipmentHours: "nav.submodule.equipmentOperatorHours",
  attendance: "nav.submodule.attendanceRecords",
  sundry: "nav.submodule.sundryClaims",
};

const BUILTIN_CATEGORY: Record<string, string> = {
  "Material Management": "material",
  "Equipment Management": "equipment",
  "Progress Management": "progress",
  "Recycle Management": "recycle",
  "Equipment In": "equipmentIn",
  "Equipment Out": "equipmentOut",
  "Material In": "materialIn",
  "Material Out": "materialOut",
};

/**
 * The message key of a built-in category's name, or null for a name the
 * project typed itself. The built-in ones are stored in English; the screen
 * says them in the reader's language.
 */
export function builtinCategoryKey(name: string): string | null {
  return BUILTIN_CATEGORY[name] ?? null;
}
