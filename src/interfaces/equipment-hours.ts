import type { RecordedBy } from "@/interfaces/recorder";

/**
 * 设备操作员工时 (2026-10 B15, Q8): the operator photographs his machine when
 * he starts and when he stops; per machine per day the first photo is the
 * start, the last the end, and the hours are the time between them.
 */

/** A machine the operator can pick on the phone: name and plate, no category. */
export interface EquipmentHoursMachine {
  id: string;
  name: string;
  code: string;
  /** 「车牌号码」 - the machine's registration number. */
  plate: string;
  project: string;
  project_name: string;
  status: string;
}

export interface EquipmentHoursPhoto {
  id: string;
  captured_at: string;
  /** Where the operator stood when he took it. */
  latitude?: string | null;
  longitude?: string | null;
  operator_name: string;
  watermarked_photo: string | null;
}

/** The office's end time for a day, with who entered it and why. */
export interface EquipmentDayAdjustment {
  id: string;
  end_at: string;
  reason: string;
  created_by_name: string;
  created_at: string;
}

/** One machine's day. */
export interface EquipmentHoursDay extends RecordedBy {
  key: string;
  equipment: string;
  equipment_name: string;
  equipment_code: string;
  plate: string;
  project: string;
  project_name: string;
  work_date: string;
  start_at: string | null;
  /** The office's end time when there is one, else the last photo's. */
  end_at: string | null;
  /** The last photo's time, before any correction; null with one photo. */
  photo_end_at: string | null;
  /** Decimal hours as a string, e.g. "9.50". */
  hours: string;
  photo_count: number;
  /** 「缺收工」: one photo and nobody has entered the end. */
  missing_end: boolean;
  adjusted: boolean;
  photos: EquipmentHoursPhoto[];
  /** Newest first; the first one is the one that counts. */
  adjustments: EquipmentDayAdjustment[];
}

export interface EquipmentHoursDays {
  date_from: string;
  date_to: string;
  rows: EquipmentHoursDay[];
}

export interface EquipmentHoursMonthRow {
  equipment: string;
  equipment_name: string;
  equipment_code: string;
  plate: string;
  project: string;
  project_name: string;
  days_worked: number;
  total_hours: string;
  missing_end_days: number;
  adjusted_days: number;
}

export interface EquipmentHoursMonth {
  month: string;
  date_from: string;
  date_to: string;
  total_hours: string;
  rows: EquipmentHoursMonthRow[];
}

/** What the server answers to one photo: the photo and the machine's day. */
export interface EquipmentHoursUpload {
  id: string;
  equipment: string;
  captured_at: string;
  work_date: string;
  client_event_id: string;
  day: EquipmentHoursDay | null;
}

export interface EquipmentHoursPhotoDraft {
  equipment: string;
  /** Shown in the offline queue, so a waiting photo says which machine. */
  equipmentLabel: string;
  photo: File;
  /**
   * When the photo was taken (ISO), from the camera's file. The day's start
   * and end are counted from it (Q8, Q29.10); without it, the moment of
   * sending stands in.
   */
  capturedAt?: string;
  latitude?: string;
  longitude?: string;
  locationAccuracyM?: string;
}

export interface EquipmentDayAdjustmentPayload {
  equipment: string;
  work_date: string;
  /** ISO datetime of the end. */
  end_at: string;
  reason: string;
}
