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
  /**
   * 现场编号: the short number the office gives the machine on this site
   * (「12」), painted on it; the operator types it to pick the machine.
   * Blank when none is given; absent on answers from before 2026-10-10.
   */
  site_no?: string;
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
  /**
   * A 开工 from an earlier day nobody closed (a forgotten 收工): the machine is
   * not running, the phone offers 开工 and asks the office to enter the 收工.
   */
  unclosed_since?: string | null;
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
  /** 司机签名 (2026-10 I4, ID20); null on photos from before. */
  signature?: string | null;
}

/** 操作人员 / CIDB 卡号 as the office wrote them for one session (I4, ID19). */
export interface EquipmentSessionOperatorEntry {
  id: string;
  operator_name: string;
  cidb_no: string;
  created_by_name: string;
  created_at: string;
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
  /** 现场编号, blank when the office has given none. */
  site_no?: string;
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
  /**
   * Decimal hours as a string, e.g. "9.50"; null while the start or the end
   * is missing - blank, not 0 (2026-10 I4: 「未收工的时间及工时留空」).
   */
  hours: string | null;
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
  /** 操作人员 and CIDB 卡号 the office wrote (I4, ID19); blank until then. */
  operator_name?: string;
  cidb_no?: string;
  /** Every version, newest first. */
  operator_history?: EquipmentSessionOperatorEntry[];
}

/** One machine of the chosen supplier and its hours over the range (I4). */
export interface EquipmentHoursMachineTotal {
  equipment: string;
  equipment_name: string;
  equipment_code: string;
  site_no: string;
  session_count: number;
  total_hours: string;
  incomplete_count: number;
}

export interface EquipmentHoursSessions {
  date_from: string;
  date_to: string;
  /** No dates were asked for: the range ends on the newest record. */
  automatic_range?: boolean;
  total_hours?: string;
  /** With a supplier and no single machine: each machine's hours (I4). */
  machine_totals?: EquipmentHoursMachineTotal[] | null;
  rows: EquipmentHoursSession[];
}

export interface EquipmentHoursMonthRow {
  equipment: string;
  equipment_name: string;
  equipment_code: string;
  site_no?: string;
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
  /** 司机签名, at the start and the stop alike (2026-10 I4, ID20). */
  signature: File;
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

/** 操作人员 / CIDB 卡号 for one session, or for the machine's whole day. */
export interface EquipmentSessionOperatorPayload {
  session: string;
  operator_name: string;
  cidb_no: string;
  apply_to_day: boolean;
}

/** The office's time for one session: the end, or the start - one of the two. */
export interface EquipmentDayAdjustmentPayload {
  session: string;
  end_at?: string;
  start_at?: string;
  reason: string;
}
