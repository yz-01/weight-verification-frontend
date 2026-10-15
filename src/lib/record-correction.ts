import type {
  CorrectableKind,
  CorrectionField,
  RecordCorrectionEntry,
} from "@/interfaces/record-correction";

/**
 * Who may correct each kind (ID70): the module's own 「管理」 permission, the
 * same the server checks. Only decides whether the button is shown.
 */
export const CORRECTION_PERMISSION: Record<CorrectableKind, string> = {
  EQUIPMENT_MOVEMENT: "equipment.manage",
  MATERIAL_OUTGOING: "material_outgoing.approve",
  WASTE_OUTGOING: "waste_outgoing.approve",
  PROGRESS: "progress.confirm",
  HAZARD: "safety.manage",
  FIELD_TASK: "field_task.manage",
  SUNDRY_CLAIM: "sundry_claim.review",
  GATE_INCIDENT: "site_access.manage",
};

/** A choice the person may leave empty: Radix Select has no empty value. */
export const NO_CHOICE = "__none__";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** An ISO time as the browser's `datetime-local` value, in local time. */
export function toLocalInput(iso: string): string {
  if (!iso) return "";
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return "";
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}T${pad(
    moment.getHours(),
  )}:${pad(moment.getMinutes())}`;
}

/** A `datetime-local` value back to an ISO time the server reads. */
export function fromLocalInput(local: string): string {
  if (!local) return "";
  const moment = new Date(local);
  return Number.isNaN(moment.getTime()) ? "" : moment.toISOString();
}

/** The dialog's starting values: what the record holds. */
export function initialDraft(fields: CorrectionField[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.type === "datetime" ? toLocalInput(field.value) : field.value,
    ]),
  );
}

function sameValue(field: CorrectionField, typed: string): boolean {
  const before = field.value;
  if (field.type === "datetime") {
    // To the minute, as the input shows it: an untouched time is not a change.
    return toLocalInput(before) === typed;
  }
  const after = typed.trim();
  if (field.type === "decimal" && before && after) {
    const a = Number(before);
    const b = Number(after);
    if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  }
  return before.trim() === after;
}

/**
 * What the person changed, as the server wants it: `changes` the new values,
 * `expected` what the dialog showed for each of them.
 */
export function correctionChanges(
  fields: CorrectionField[],
  draft: Record<string, string>,
): { changes: Record<string, string>; expected: Record<string, string> } {
  const changes: Record<string, string> = {};
  const expected: Record<string, string> = {};
  for (const field of fields) {
    const typed = draft[field.name] ?? "";
    if (sameValue(field, typed)) continue;
    changes[field.name] = field.type === "datetime" ? fromLocalInput(typed) : typed.trim();
    expected[field.name] = field.value;
  }
  return { changes, expected };
}

/** The first required field left empty, or null. */
export function missingRequired(
  fields: CorrectionField[],
  draft: Record<string, string>,
): CorrectionField | null {
  return fields.find((field) => field.required && !(draft[field.name] ?? "").trim()) ?? null;
}

/** A number the server would refuse (not a number, zero or less), by field. */
export function badNumber(
  fields: CorrectionField[],
  draft: Record<string, string>,
): CorrectionField | null {
  return (
    fields.find((field) => {
      if (field.type !== "decimal") return false;
      const typed = (draft[field.name] ?? "").trim();
      if (!typed) return false;
      const number = Number(typed);
      return !Number.isFinite(number) || number <= 0;
    }) ?? null
  );
}

/** One save's rows together, newest save first: one entry in 「改正记录」. */
export function groupCorrections(rows: RecordCorrectionEntry[]): RecordCorrectionEntry[][] {
  const groups = new Map<string, RecordCorrectionEntry[]>();
  for (const row of rows) {
    const group = groups.get(row.batch);
    if (group) group.push(row);
    else groups.set(row.batch, [row]);
  }
  return [...groups.values()].sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
}
