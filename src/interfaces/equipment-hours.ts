import type { RecordedBy } from "@/interfaces/recorder";

/**
 * 设备操作员工时 (2026-10 B15; by in/out pairs since 2026-10-10): the operator
 * photographs his machine when he starts it (开工) and when he stops it (收工).
 * A start and the stop right after it are one session - one row - and its
 * hours are the time between them, whatever the clock says.
 */

/** 开工 or 收工 - what the operator said the photo is. */
export type EquipmentPhotoKind = "START" | "FINISH";

/**
 * A machine the operator can pick on the phone: equipment number, name,
 * plate and supplier, no category (F3).
 */
export interface EquipmentHoursMachine {
  id: string;
  name: string;
  /** 设备编号. */
  code: string;
  /** 「车牌号码」 - the machine's registration number. */
  plate: string;
  serial_no?: string;
  supplier?: string | null;
  supplier_name?: string;
  project: string;
  project_name: string;
  status: string;
  /** When its open session started (its newest photo is a 开工), else null. */
  open_since?: string | null;
}

export interface EquipmentHoursSupplier {
  id: string;
  name: string;
  code: string;
}

/** The office's 设备 and 供应商 filter lists. */
export interface EquipmentHoursFilterOptions {
  equipment: EquipmentHoursMachine[];
  suppliers: EquipmentHoursSupplier[];
}

export interface EquipmentHoursPhoto {
  id: string;
  /** Absent only on answers from before 2026-10-10. */
  kind?: EquipmentPhotoKind;
  captured_at: string;
  /** Where the operator stood when he took it. */
  latitude?: string | null;
  longitude?: string | null;
  operator_name: string;
  watermarked_photo: string | null;
}

/** An office correction of a session: its end, or (no start photo) its start. */
export interface EquipmentDayAdjustment {
  id: string;
  start_at?: string | null;
  end_at: string | null;
  reason: string;
  created_by_name: string;
  created_at: string;
}

export type EquipmentSessionStatus = "OK" | "MISSING_END" | "MISSING_START" | "ADJUSTED";

/** One start-to-stop of one machine: one row of the office table. */
export interface EquipmentHoursSession extends RecordedBy {
  /** The id of the session's first photo; what a correction names. */
  key: string;
  equipment: string;
  equipment_name: string;
  equipment_code: string;
  plate: string;
  supplier: string | null;
  supplier_name: string;
  project: string;
  project_name: string;
  /** The date of the start photo (or of the stop, with no start). */
  work_date: string;
  start_at: string | null;
  /** The office's end time when there is one, else the stop photo's. */
  end_at: string | null;
  /** The stop photo's time, before any correction. */
  photo_end_at: string | null;
  /** The machine's photos just before and after: an office time stays between. */
  previous_at?: string | null;
  next_at?: string | null;
  /** Decimal hours as a string, e.g. "9.50". */
  hours: string;
  /** 累计工时 down the rows shown, in the table's order. */
  cumulative_hours?: string | null;
  photo_count: number;
  /** 「缺开工」: a stop photo with no start, and none entered. */
  missing_start: boolean;
  /** 「缺收工」: a start photo with no stop, and none entered. */
  missing_end: boolean;
  has_start_photo: boolean;
  adjusted: boolean;
  status: EquipmentSessionStatus;
  photos: EquipmentHoursPhoto[];
  /** Newest first; the newest of each kind is the one that counts. */
  adjustments: EquipmentDayAdjustment[];
}

export interface EquipmentHoursSessions {
  date_from: string;
  date_to: string;
  /** No dates were asked for: the range ends on the newest record. */
  automatic_range?: boolean;
  total_hours?: string;
  rows: EquipmentHoursSession[];
}

export interface EquipmentHoursMonthRow {
  equipment: string;
  equipment_name: string;
  equipment_code: string;
  plate: string;
  supplier_name: string;
  project: string;
  project_name: string;
  days_worked: number;
  session_count: number;
  total_hours: string;
  /** Sessions still missing a start or an end. */
  incomplete_count: number;
  adjusted_count: number;
}

export interface EquipmentHoursMonth {
  month: string;
  date_from: string;
  date_to: string;
  total_hours: string;
  rows: EquipmentHoursMonthRow[];
}

/** What the server answers to one photo: the photo and its session. */
export interface EquipmentHoursUpload {
  id: string;
  equipment: string;
  kind: EquipmentPhotoKind;
  captured_at: string;
  work_date: string;
  client_event_id: string;
  session: EquipmentHoursSession | null;
}

export interface EquipmentHoursPhotoDraft {
  equipment: string;
  /** Shown in the offline queue, so a waiting photo says which machine. */
  equipmentLabel: string;
  kind: EquipmentPhotoKind;
  photo: File;
  /**
   * When the photo was taken (ISO), from the camera's file. The session's
   * start and end are counted from it (Q29.10); without it, the moment of
   * sending stands in.
   */
  capturedAt?: string;
  latitude?: string;
  longitude?: string;
  locationAccuracyM?: string;
}

/** The office's time for one session: the end, or the start - one of the two. */
export interface EquipmentDayAdjustmentPayload {
  session: string;
  end_at?: string;
  start_at?: string;
  reason: string;
}
