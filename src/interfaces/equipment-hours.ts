import type { InspectionInfo } from "@/interfaces/document-workflow";
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
  /**
   * JB280 第 7 点: the checked / settled 设备租赁月结单 this day's hours are in
   * ("" or absent when none) - nothing on it is changed any more.
   */
  locked_statement_no?: string;
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
  /** 正常工时 / 超时工时 (J31): settled when the session ended; null while an end is missing. */
  normal_hours?: string | null;
  overtime_hours?: string | null;
  /** 累计工时 down the rows shown, in the table's order. */
  cumulative_hours?: string | null;
  /** The running 正常 / 超时 totals down the same rows (J31-5). */
  cumulative_normal_hours?: string | null;
  cumulative_overtime_hours?: string | null;
  photo_count: number;
  /** J34-3: the first photographs' thumbnails, for the list's strip. */
  photo_thumbs?: string[];
  /** 「缺开工」: a stop photo with no start, and none entered. */
  missing_start: boolean;
  /** 「缺收工」: a start photo with no stop, and none entered. */
  missing_end: boolean;
  has_start_photo: boolean;
  adjusted: boolean;
  /** 检验 (J11-1): the machine's latest inspection, or none. */
  inspection?: InspectionInfo | null;
  /** The gold 已修改 (J20): a time or the machine corrected by the office. */
  was_corrected?: boolean;
  /** 改设备归属 (J1-13): the machine the photos were taken of, when moved. */
  taken_on_name?: string;
  status: EquipmentSessionStatus;
  photos: EquipmentHoursPhoto[];
  /** Newest first; the newest of each kind is the one that counts. */
  adjustments: EquipmentDayAdjustment[];
  /** 操作人员 and CIDB 卡号 the office wrote (I4, ID19); blank until then. */
  operator_name?: string;
  cidb_no?: string;
  /** Every version, newest first. */
  operator_history?: EquipmentSessionOperatorEntry[];
  /**
   * 操作人员资料 (JB233): the registered operator the row names - null for a
   * name typed by hand - and whether one of his papers ran out.
   */
  operator_profile_id?: string | null;
  operator_expiry?: OperatorExpiry;
}

/** One machine of the chosen supplier and its hours over the range (I4). */
export interface EquipmentHoursMachineTotal {
  equipment: string;
  equipment_name: string;
  equipment_code: string;
  site_no: string;
  session_count: number;
  normal_hours?: string;
  overtime_hours?: string;
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
  /** J31: the month's normal and overtime hours. */
  normal_hours?: string;
  overtime_hours?: string;
  total_hours: string;
  /** Sessions still missing a start or an end. */
  incomplete_count: number;
  adjusted_count: number;
  /**
   * JB280 第 5 点 「月结单与设备原始记录…双向关联」: the live 设备租赁月结单 this
   * machine's days of the month are in.
   */
  statements?: Array<{ id: string; statement_no: string; state: "PENDING" | "CHECKED" | "SETTLED" | "CANCELLED" }>;
  /**
   * JB255 设备租赁费用: the five amounts right of 「后台修改次数」 (RM, as
   * strings; null when 金额查看 is switched off for the reader).
   */
  base_rent?: string | null;
  overtime_fee?: string | null;
  diesel_fee?: string | null;
  adjustment_amount?: string | null;
  rental_total?: string | null;
  rental_method?: RentalMethod | "";
  rental_terms?: RentalTermsValues | Record<string, never>;
  rental_has_terms?: boolean;
  rental_days?: number;
  extra_days?: number;
  extra_day_fee?: string | null;
  adjustment_reason?: string;
  rental_confirmed?: boolean;
  rental_confirmed_at?: string | null;
  rental_confirmed_by?: string;
}

/** 租赁方式 (JB255). */
export type RentalMethod = "HOURLY" | "DAILY" | "MONTHLY" | "YEARLY" | "FIXED";

/** 柴油供应方式 (JB255). */
export type DieselSupply = "INCLUDED" | "CONTRACTOR" | "SUPPLIER_CHARGED";

/** One machine's 租赁条件 as the server keeps them (money as strings). */
export interface RentalTermsValues {
  id?: string;
  method: RentalMethod;
  unit_price: string | null;
  standard_days: number | null;
  normal_hours_per_day: string;
  overtime_rate: string | null;
  extra_day_rate: string | null;
  stoppage_terms: string;
  start_date: string;
  end_date: string;
  diesel_supply: DieselSupply;
  remarks: string;
  /** 生效日期 (JB288): these terms count from this day; earlier days keep the terms in force then. */
  effective_from?: string;
  /** JB288: the terms changed inside the month / dates - every set with its days (and, for a month, its figures). */
  pieces?: RentalTermsPiece[];
  changed_at?: string;
  changed_by?: string;
}

/** One run of days priced with one set of terms (JB288). */
export interface RentalTermsPiece {
  from: string;
  to: string;
  terms: RentalTermsValues;
  days_worked?: number;
  normal_hours?: string;
  overtime_hours?: string;
  base_rent?: string;
  overtime_fee?: string;
}

/** 【设备租赁设定】's list: one machine, its terms and their history. */
export interface RentalMachine {
  id: string;
  number: string;
  name: string;
  plate: string;
  supplier_name: string;
  terms: RentalTermsValues | null;
  history: RentalTermsValues[];
}

export interface RentalMachines {
  machines: RentalMachine[];
  without_terms: number;
}

/** The month's 合计 of the five amounts (JB255). */
export interface RentalTotals {
  base_rent: string | null;
  overtime_fee: string | null;
  diesel_fee: string | null;
  adjustment_amount: string | null;
  rental_total: string | null;
}

export interface EquipmentHoursMonth {
  month: string;
  date_from: string;
  date_to: string;
  total_hours: string;
  rows: EquipmentHoursMonthRow[];
  rental_totals?: RentalTotals;
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
  /** A driver's own link (J26), instead of an account. */
  driverLink?: { token: string; device: string };
}

/** 操作人员 / CIDB 卡号 for one session, or for the machine's whole day. */
export interface EquipmentSessionOperatorPayload {
  session: string;
  operator_name: string;
  cidb_no: string;
  apply_to_day: boolean;
  /** A registered operator picked from the list (JB233). */
  profile?: string | null;
}

/** expired / expiring (within 30 days) / ok / none (no date filled in). */
export type OperatorExpiry = "expired" | "expiring" | "ok" | "none";

export type OperatorCertificateCategory = "CIDB" | "DRIVING_LICENCE" | "MACHINE_COMPETENCY" | "OTHER";

export type OperatorFileSection = "CIDB" | "DRIVING_LICENCE" | "CERTIFICATE";

/** A photo or PDF of a card or certificate (JB233). */
export interface OperatorPaperFile {
  id: string;
  section: OperatorFileSection;
  certificate: string | null;
  original_name: string;
  content_type: string;
  preview_type: string | null;
  byte_size: number;
  is_image: boolean;
  uploaded_at: string | null;
  uploaded_by_name: string;
}

export interface OperatorCertificate {
  id: string;
  category: OperatorCertificateCategory;
  title: string;
  number: string;
  issued_on: string | null;
  expires_on: string | null;
  expiry: OperatorExpiry;
  files: OperatorPaperFile[];
}

/** One registered operator's papers, as the 操作人员资料 window shows them. */
export interface OperatorPapers {
  id: string;
  kind: "link" | "account";
  link: string | null;
  user: string | null;
  name: string;
  company_name: string;
  project_name: string;
  is_active: boolean;
  /** Only for those who manage the drivers. */
  phone: string | null;
  cidb_no: string;
  cidb_expires_on: string | null;
  cidb_expiry: OperatorExpiry;
  licence_no: string;
  licence_class: string;
  licence_expires_on: string | null;
  licence_expiry: OperatorExpiry;
  certificates: OperatorCertificate[];
  cidb_files: OperatorPaperFile[];
  licence_files: OperatorPaperFile[];
  expiry: OperatorExpiry;
  can_edit: boolean;
}

/** One line of 「选择已登记的操作人员」. */
export interface RegisteredOperator {
  id: string;
  kind: "link" | "account";
  name: string;
  cidb_no: string;
  company_name: string;
  expiry: OperatorExpiry;
}

/** What 编辑资料 sends: the card, the licence and the whole certificate list. */
export interface OperatorPapersPayload {
  profile: string;
  cidb_no: string;
  cidb_expires_on: string | null;
  licence_no: string;
  licence_class: string;
  licence_expires_on: string | null;
  certificates: Array<{
    id?: string;
    category: OperatorCertificateCategory;
    title: string;
    number: string;
    issued_on: string | null;
    expires_on: string | null;
  }>;
}

/** The office's time for one session: the end, or the start - one of the two. */
export interface EquipmentDayAdjustmentPayload {
  session: string;
  end_at?: string;
  start_at?: string;
  reason: string;
}

/**
 * One record on a phone (J37): the two ends and the hours as the office
 * works them out - 正常 / 超时 / 总, never worked out again on the phone.
 * Hours are blank while the 收工 is missing.
 */
export interface EquipmentPhoneRecord {
  key: string;
  /** `YYYY-MM-DD`, the day it started. */
  work_date: string;
  equipment_name: string;
  equipment_code: string;
  site_no: string;
  operator_name: string;
  start_at: string | null;
  end_at: string | null;
  hours: string | null;
  normal_hours: string | null;
  overtime_hours: string | null;
  missing_end: boolean;
}

/** The sums of the records a phone lists. */
export interface EquipmentPhoneTotals {
  normal_hours: string;
  overtime_hours: string;
  total_hours: string;
  session_count: number;
}
