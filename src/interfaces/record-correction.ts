/**
 * The shared 「改正」 (I30, ID70): the office corrects whitelisted values of a
 * site record; the old values, who, when and why are kept.
 */

/** The kinds whose detail offers the 【改正】 dialog. */
export type CorrectableKind =
  | "EQUIPMENT_MOVEMENT"
  | "MATERIAL_OUTGOING"
  | "WASTE_OUTGOING"
  | "PROGRESS"
  | "HAZARD"
  | "FIELD_TASK"
  | "SUNDRY_CLAIM"
  | "GATE_INCIDENT";

/** Kinds whose correction history can be read (their own module corrects them). */
export type CorrectionHistoryKind =
  | CorrectableKind
  | "DISPOSAL_REQUEST"
  | "MATERIAL_RECEIPT"
  | "DAILY_REPORT"
  | "EQUIPMENT_HOURS";

export type CorrectionFieldType = "text" | "textarea" | "decimal" | "choice" | "datetime";

export interface CorrectionOption {
  value: string;
  label: string;
  /** A specification's material (I19): offered under that material only. */
  parent?: string;
  /** 「其他」: the words are typed on the record. */
  is_other?: boolean;
  /** The unit a specification brings with it ("" when it has none). */
  unit?: string;
}

export interface CorrectionField {
  name: string;
  type: CorrectionFieldType;
  required: boolean;
  max_length: number | null;
  /** What the record holds now, as the form sends it back. */
  value: string;
  /** The same, as a reader reads it (a supplier's name). */
  display: string;
  options: CorrectionOption[] | null;
  /** Offer only the options whose `parent` is this field's value. */
  depends_on?: string;
  /** Take the unit of this field's chosen option, and lock while it has one. */
  follows?: string;
  /** Shown only while this field's chosen option is 「其他」. */
  only_for_other?: string;
}

export interface CorrectionForm {
  kind: CorrectableKind;
  record: string;
  reference: string;
  /** Why it cannot be corrected now - archived, project closed, decided. */
  blocked: { reason: string; message: string } | null;
  fields: CorrectionField[];
}

export type CorrectionSource = "CORRECTION" | "RETURN_NOTE" | "EDIT" | "MODULE";

export interface RecordCorrectionEntry {
  id: string;
  /** The rows one save wrote share it. */
  batch: string;
  source: CorrectionSource;
  field: string;
  /** Which part of the record, where it has several (a lorry: 「#2」). */
  item_label: string;
  value_from: string;
  value_to: string;
  reason: string;
  corrected_by_name: string;
  created_at: string;
}

export interface RecordCorrectionHistory {
  kind: CorrectionHistoryKind;
  record: string;
  corrections: RecordCorrectionEntry[];
}

export interface CorrectRecordResult {
  corrections: RecordCorrectionEntry[];
  form: CorrectionForm;
}
