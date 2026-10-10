import type { PrintLetterhead } from "@/lib/print-letterhead";
import type { RecordedBy } from "@/interfaces/recorder";

export type GeofenceShape = "CIRCLE" | "POLYGON";

export interface SiteGeofence {
  id: string;
  project: string;
  project_name: string;
  name: string;
  shape: GeofenceShape;
  address: string;
  latitude: string | null;
  longitude: string | null;
  radius_m: number | null;
  polygon: Array<[number, number]>;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteGeofencePayload {
  project: string;
  name: string;
  shape: GeofenceShape;
  address: string;
  latitude: string | null;
  longitude: string | null;
  radius_m: number | null;
  polygon: Array<[number, number]>;
  is_primary: boolean;
  is_active: boolean;
}

export interface CompanyBranch {
  id: string;
  code: string;
  name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  phone: string;
  email: string;
  latitude: string | null;
  longitude: string | null;
  is_headquarters: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractorSiteSettings {
  id: string;
  default_geofence_radius_m: number;
  location_update_interval_seconds: number;
  live_position_window_seconds: number;
  visitor_pass_hours: number;
  qr_prefix: string;
  qr_style: "STANDARD" | "COMPACT" | "LARGE";
  enable_site_access_qr: boolean;
  enable_visitor_qr: boolean;
  enable_vehicle_qr: boolean;
  default_project_status: "PLANNING" | "ACTIVE";
  default_project_categories: Array<{
    code: string;
    name: string;
    description?: string;
    is_visible_in_pwa: boolean;
  }>;
  default_archive_rules: Record<string, boolean>;
  default_notification_rules: Record<string, boolean>;
  default_user_role_code: string;
  default_approval_role_code: string;
  default_consultant_permissions: string[];
  date_format: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  time_format: "12H" | "24H";
  language: "en" | "zh" | "zh-TW" | "ms";
  timezone: string;
  home_page: "/dashboard" | "/projects" | "/notifications" | "/field-staff";
  default_notification_channel: "IN_APP" | "PUSH";
  email_notifications: boolean;
  system_notifications: boolean;
  approval_notifications: boolean;
  rectification_notifications: boolean;
  expiry_notifications: boolean;
  target_reminder_percent: number;
  field_pin_expiry_days: number;
  require_attendance_photo: boolean;
  require_gate_photo: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  updated_at: string;
}

export interface ContractorCompanyProfile {
  id: string;
  code: string;
  name: string;
  description: string;
  registration_no: string;
  tax_id: string;
  sst_no: string;
  contact_person: string;
  contact_designation: string;
  logo: string | null;
  /** C12: set by the company itself; read by its own pages. */
  background_image: string | null;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  latitude: string | null;
  longitude: string | null;
  contact_phone: string;
  contact_email: string;
  billing_email: string;
  website: string;
  default_language: "en" | "zh" | "zh-TW" | "ms";
  timezone: string;
  updated_at: string;
}

export interface SiteLocationPolicy {
  location_update_interval_seconds: number;
  live_position_window_seconds: number;
  require_attendance_photo: boolean;
}

export type AccessSubjectType = "WORKER" | "VISITOR" | "VEHICLE";
export type AccessPassStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
export type EffectiveAccessPassStatus = AccessPassStatus | "EXPIRED";
export type AccessDirection = "ENTRY" | "EXIT";

export interface SiteAccessEvent {
  id: string;
  direction: AccessDirection;
  occurred_at: string;
  source: "GATE_UI" | "THIRD_PARTY";
  device_id: string;
  gate_name: string;
  client_event_id: string;
  latitude: string | null;
  longitude: string | null;
  photo: string | null;
  note: string;
  scanned_by_name: string | null;
  created_at: string;
}

export interface SiteAccessPass {
  id: string;
  /** Waits for this reader's approval - the sidebar counts it (2026-10-09). */
  needs_action?: boolean;
  pass_no: string;
  project: string;
  project_name: string;
  subject_type: AccessSubjectType;
  worker: string | null;
  worker_name: string | null;
  subject_name: string;
  subject_company: string;
  phone: string;
  identity_no: string;
  vehicle_plate: string;
  driver_name: string;
  purpose: string;
  host_name: string;
  valid_from: string;
  valid_until: string;
  status: AccessPassStatus;
  effective_status: EffectiveAccessPassStatus;
  qr_value: string;
  approved_by_name: string | null;
  approved_at: string | null;
  review_note: string;
  revoked_at: string | null;
  current_direction: AccessDirection | null;
  events: SiteAccessEvent[];
  created_at: string;
  updated_at: string;
}

/**
 * What a card reader, plate camera or face unit presents at the gate.
 *
 * `QR` is here for completeness but is not what the pass itself uses: a QR
 * entry matches the pass's own token directly and needs no registration.
 */
export type AccessCredentialType =
  | "QR"
  | "ANPR"
  | "RFID"
  | "FACE"
  | "VISITOR_ID";

/**
 * A registered credential, as the server is willing to give it back.
 *
 * The card number or plate itself is never returned — the server stores only a
 * hash and a short hint. So a credential can be recognised in a list and
 * revoked, but never read back out, which is the point.
 */
export interface SiteAccessCredential {
  id: string;
  credential_type: AccessCredentialType;
  identifier_hint: string;
  label: string;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  revoked_at: string | null;
  created_at: string;
}

export interface SiteAccessCredentialPayload {
  credential_type: Exclude<AccessCredentialType, "QR">;
  credential_value: string;
  label?: string;
  valid_from?: string | null;
  valid_until?: string | null;
}

export interface SiteAccessPassPayload {
  project: string;
  subject_type: AccessSubjectType;
  worker?: string | null;
  subject_name: string;
  subject_company: string;
  phone: string;
  identity_no: string;
  vehicle_plate: string;
  driver_name: string;
  purpose: string;
  host_name: string;
  valid_from: string;
  valid_until: string;
}

/**
 * One person on the 紧急在场名单 (C21). `APP`: in by the phone's fence; `GATE`:
 * in through the gate on a pass; `BOTH`: the pass's own account is also in
 * by the phone, so it is one row, not two.
 */
export type EmergencySource = "APP" | "GATE" | "BOTH";

export interface EmergencyList {
  count: number;
  app_count: number;
  gate_count: number;
  people: EmergencyPresence[];
  /** What the printed list is headed with: the company's own name and logo
   *  and the chosen project (全系统公司表头规则). */
  letterhead?: PrintLetterhead;
}

export interface EmergencyPresence {
  source: EmergencySource;
  event_id: string | null;
  pass_id: string | null;
  pass_no: string;
  user_id: string | null;
  project_id: string;
  project_name: string;
  subject_type: AccessSubjectType;
  subject_name: string;
  subject_company: string;
  phone: string;
  vehicle_plate: string;
  entered_at: string;
  gate_name: string;
  minutes_on_site: number;
  last_updated_at: string;
  last_report_at: string | null;
  stale: boolean;
}

export interface ThirdPartyAccessEvent {
  id: string;
  project: string;
  project_name: string;
  device: string;
  device_id: string;
  access_pass: string | null;
  pass_no: string | null;
  site_access_event: string | null;
  credential_type: AccessCredentialType;
  recognition_result: string;
  credential_hint: string;
  direction: AccessDirection;
  occurred_at: string;
  received_at: string;
  client_event_id: string;
  gate_name: string;
  latitude: string | null;
  longitude: string | null;
  verification_result: string;
  reason_code: string;
  payload_sha256: string;
}

/** What a guard photographed at the gate (C22). */
export type GateIncidentCategory =
  | "SUSPICIOUS_PERSON"
  | "THEFT"
  | "ABNORMAL_VEHICLE"
  | "ITEM_REMOVAL"
  | "DISPUTE"
  | "OTHER";

export const GATE_INCIDENT_CATEGORIES: readonly GateIncidentCategory[] = [
  "SUSPICIOUS_PERSON",
  "THEFT",
  "ABNORMAL_VEHICLE",
  "ITEM_REMOVAL",
  "DISPUTE",
  "OTHER",
];

/** One photo, carrying its own project, gate, guard, time and GPS. */
export interface GatePhoto {
  id: string;
  image: string;
  watermarked_image: string | null;
  gate_name: string;
  guard: string;
  guard_name: string;
  captured_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  client_event_id: string;
  created_at: string;
}

export interface GateIncidentMember {
  id: string;
  user: string;
  full_name: string;
  role_name: string;
  added_by_name: string | null;
  created_at: string;
}

export interface GateIncident extends RecordedBy {
  id: string;
  incident_no: string;
  project: string;
  project_name: string;
  category: GateIncidentCategory;
  gate_name: string;
  description: string;
  guard: string;
  guard_name: string;
  occurred_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  access_pass: string | null;
  pass_no: string | null;
  pass_subject_name: string | null;
  access_event: string | null;
  access_event_direction: AccessDirection | null;
  access_event_at: string | null;
  photo_count: number;
  cover_photo: string | null;
  created_at: string;
}

export interface GateIncidentDetail extends GateIncident {
  photos: GatePhoto[];
  members: GateIncidentMember[];
}

export interface GateMemberOption {
  id: string;
  full_name: string;
  role_name: string;
}

/** A photo as the phone took it: when, and where if it knew. */
export interface GatePhotoDraft {
  file: File;
  captured_at: string;
  latitude?: string;
  longitude?: string;
  accuracy_m?: string;
  client_event_id: string;
}

/** A pass found from a scanned QR, to link a gate photo record to (Q18). */
export interface GatePassMatch {
  id: string;
  pass_no: string;
  subject_name: string;
  vehicle_plate: string;
  status: AccessPassStatus;
}

/**
 * What the guard's phone sends (Q18): photos, an optional scanned pass, the
 * people asked in and their first words. No category - the server files it
 * as OTHER - and no gate name or description.
 */
export interface GateIncidentPayload {
  project: string;
  access_pass?: string;
  members: string[];
  first_message?: string;
  latitude?: string;
  longitude?: string;
  accuracy_m?: string;
  client_event_id: string;
  photos: GatePhotoDraft[];
}
