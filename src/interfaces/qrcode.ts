/** Admin QR register contracts (module 7). */

export type QRSubjectType =
  | "CONTRACTOR"
  | "RECYCLER"
  | "SUPPLIER"
  | "DRIVER"
  | "VEHICLE"
  | "FIELD_STAFF"
  | "VISITOR"
  | "DEVICE";

export type QRCodeStatus =
  | "ACTIVE"
  | "DISABLED"
  | "VOIDED"
  | "EXPIRED"
  | "SUPERSEDED";

export type QRScanOutcome =
  | "SUCCESS"
  | "UNKNOWN_CODE"
  | "DISABLED"
  | "VOIDED"
  | "EXPIRED"
  | "WRONG_LOCATION"
  | "DUPLICATE"
  | "DUPLICATE_WARNING";

export interface QRCode {
  id: string;
  serial: string;
  subject_type: QRSubjectType;
  subject_type_display: string;
  subject_id: string | null;
  subject_label: string;
  company: string | null;
  company_code: string | null;
  company_name: string | null;
  project: string | null;
  project_name: string | null;
  site: string | null;
  site_name: string | null;
  status: QRCodeStatus;
  effective_status: QRCodeStatus;
  issued_on: string;
  expires_on: string | null;
  is_expired: boolean;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_changed_by_name: string | null;
  status_note: string;
  replaces: string | null;
  replaces_serial: string | null;
  last_scanned_at: string | null;
  scan_count: number;
  notes: string;
  created_at: string;
}

export interface QRCodeIssue extends QRCode {
  /** Returned only at issue/reissue time so the card can be printed. */
  token: string;
}

export interface QRScanRecord {
  id: string;
  code: string | null;
  serial: string;
  subject_type: QRSubjectType | null;
  subject_label: string | null;
  outcome: QRScanOutcome;
  outcome_display: string;
  scanned_at: string;
  scanned_by: string | null;
  scanned_by_name: string | null;
  company: string | null;
  company_name: string | null;
  project: string | null;
  project_name: string | null;
  site: string | null;
  site_name: string | null;
  location_label: string;
  latitude: string | null;
  longitude: string | null;
  device_id: string;
  note: string;
}

export interface QRCodeSummary {
  total: number;
  by_subject_type: Partial<Record<QRSubjectType, number>>;
  by_status: Partial<Record<QRCodeStatus, number>>;
  scans_today: number;
  failed_scans_today: number;
}

export interface IssueQRCodePayload {
  subject_type: QRSubjectType;
  subject_id?: string;
  subject_label: string;
  company?: string;
  project?: string;
  site?: string;
  expires_on?: string | null;
  notes?: string;
}

export interface QRSubjectOptions {
  subjects: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; label: string }>;
  sites: Array<{ id: string; label: string }>;
}

export interface QRScanPayload {
  token: string;
  latitude?: string;
  longitude?: string;
  location_label?: string;
  device_id?: string;
  note?: string;
}

export interface QRScanResult {
  outcome: QRScanOutcome;
  accepted: boolean;
  scan: QRScanRecord;
  code: QRCode | null;
}
