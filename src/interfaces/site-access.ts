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
  /** The number before I6 renumbered it (「旧编号」); empty on a newer record. */
  legacy_no?: string;
  /** The project code, so the list splits the short number right (ID35). */
  project_code?: string;
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
  /** 接待人 as a person on the project (I26), when the pass names one. */
  host_user?: string | null;
  host_user_name?: string | null;
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
  /** 接待人 chosen from the project's people (I26); null for none. */
  host_user?: string | null;
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
  /** The number before I6 renumbered it (「旧编号」); empty on a newer record. */
  legacy_no?: string;
  /** The project code, so the list splits the short number right (ID35). */
  project_code?: string;
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
  /**
   * 「特殊事项」 (HD5): a Gate Issue - a note, people asked in, open until
   * confirmed finished. Off, a plain Photo Record: one photo, filed.
   */
  is_issue: boolean;
  /** 处理中 / 已完成; null on a plain photo. */
  issue_status: GateIssueStatus | null;
  /** The guard's note: the first message of the issue's conversation. */
  issue_note: string;
  closed_by_name: string | null;
  closed_at: string | null;
  /** The people asked in, as one line. */
  member_names: string;
  created_at: string;
}

export type GateIssueStatus = "OPEN" | "CLOSED";

export interface GateIncidentDetail extends GateIncident {
  photos: GatePhoto[];
  members: GateIncidentMember[];
  /** Whether this reader may press 「确认结束」 now (HD6). */
  may_close: boolean;
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

/**
 * What the guard's phone sends (HD5): photos and, for a 「特殊事项」, the
 * note and the people asked in. A plain photo record is one photo.
 */
export interface GateIncidentPayload {
  project: string;
  is_issue: boolean;
  members: string[];
  first_message?: string;
  latitude?: string;
  longitude?: string;
  accuracy_m?: string;
  client_event_id: string;
  photos: GatePhotoDraft[];
}

/** The dashboards' 门岗 card (HD10). */
export interface GateSummary {
  today_photos: number;
  open_issues: number;
  thumbs: Array<{
    id: string;
    incident: string;
    incident_no: string;
    is_issue: boolean;
    project: string;
    project_name: string;
    guard_name: string;
    captured_at: string;
    watermarked_image: string | null;
  }>;
}

/** Why the gate cannot confirm a scanned pass (HD7). */
export type GatePassRefusal =
  | "not_found"
  | "other_project"
  | "not_approved"
  | "revoked"
  | "not_yet_valid"
  | "expired"
  | "already_inside"
  | "already_outside"
  // I26: a visitor whose host has not confirmed yet.
  | "host_not_confirmed";

/** What the guard reads after scanning a pass (HD7). */
export interface GatePassDetail {
  id: string;
  pass_no: string;
  subject_type: AccessSubjectType;
  subject_name: string;
  subject_company: string;
  phone: string;
  vehicle_plate: string;
  driver_name: string;
  purpose: string;
  host_name: string;
  /** The pass's host, when still reachable on this project (I26). */
  host_user?: string | null;
  host_user_name?: string | null;
  project: string;
  project_name: string;
  approved_by_name: string | null;
  approved_at: string | null;
  valid_from: string;
  valid_until: string;
  status: AccessPassStatus;
}

export interface GatePassCheck {
  project: string;
  /** The whole pass; for another project's pass only its number and project. */
  pass: (Partial<GatePassDetail> & Pick<GatePassDetail, "pass_no" | "project_name">) | null;
  refusal: GatePassRefusal | null;
  refusal_message: string;
  can_enter: boolean;
  can_exit: boolean;
  last_direction: AccessDirection | null;
  last_at: string | null;
  /** A visitor's pass: photo and host confirmation before 放行 (I26). */
  needs_host?: boolean;
  /** The visit already at the gate on this pass, picked up again. */
  arrival?: VisitorArrival | null;
}

/** One confirmed entry or exit, with its pass (Visitor Records, HD9). */
export interface VisitorRecord {
  /** The project code, so the list splits the short number right (ID35). */
  project_code?: string;
  id: string;
  /** A visit (I26) or a gate event with no visit behind it. */
  row_type: "ARRIVAL" | "EVENT";
  occurred_at: string;
  direction: AccessDirection | null;
  visit_status: VisitStatus | null;
  source: "GATE_UI" | "THIRD_PARTY";
  gate_name: string;
  pass_id: string;
  pass_no: string;
  subject_type: AccessSubjectType;
  subject_name: string;
  subject_company: string;
  phone: string;
  vehicle_plate: string;
  purpose: string;
  valid_until: string;
  approved_by_name: string | null;
  project: string;
  project_name: string;
  scanned_by_name: string | null;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
  arrival_id: string | null;
  arrival_no: string | null;
  photo: string | null;
  photo_thumbnail: string | null;
  photo_count: number;
  host_name: string;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  on_behalf: boolean;
  declined_by_name: string | null;
  decline_reason: string | null;
  entry_at: string | null;
  exit_at: string | null;
}

/** 访客进场确认 (I26): where one visit stands. */
export type VisitorArrivalStatus = "AWAITING_HOST" | "CONFIRMED" | "DECLINED" | "CANCELLED";
/** The visit in one word, entry and exit included. */
export type VisitStatus = VisitorArrivalStatus | "ON_SITE" | "LEFT";

export interface VisitorArrivalPhoto {
  id: string;
  watermarked_image: string;
  thumbnail: string;
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  gate_user_name: string;
}

/** One visitor at the gate: photographed, their host asked (I26, ID63). */
export interface VisitorArrival {
  /** The number before I6 renumbered it (「旧编号」); empty on a newer record. */
  legacy_no?: string;
  /** The project code, so the list splits the short number right (ID35). */
  project_code?: string;
  id: string;
  arrival_no: string;
  project: string;
  project_name: string;
  pass_id: string;
  pass_no: string;
  subject_type: AccessSubjectType;
  subject_name: string;
  subject_company: string;
  phone: string;
  purpose: string;
  valid_until: string;
  host: string;
  host_name: string;
  gate_user: string;
  gate_user_name: string;
  gate_name: string;
  arrived_at: string;
  latitude: string | null;
  longitude: string | null;
  status: VisitorArrivalStatus;
  visit_status: VisitStatus;
  confirmed_by_name: string;
  confirmed_at: string | null;
  declined_by_name: string;
  declined_at: string | null;
  decline_reason: string;
  on_behalf: boolean;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  entry_at: string | null;
  exit_at: string | null;
  photos: VisitorArrivalPhoto[];
  /** This reader is the host, or manages site access, and it still waits. */
  may_answer: boolean;
  may_cancel: boolean;
  /** Only for whoever works the gate. */
  qr_value: string | null;
  created_at: string;
}

/** A person who may host a visitor on a project (ID64). */
export interface VisitorHostOption {
  id: string;
  full_name: string;
  role_name: string;
}
