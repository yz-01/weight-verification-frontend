/** Project-scoped records used by the contractor and site staff portals. */

export type AttendanceEvent = "CLOCK_IN" | "CLOCK_OUT";

export interface AttendanceRecord {
  id: string;
  project: string;
  project_name: string;
  user: string;
  user_name: string;
  event: AttendanceEvent;
  occurred_at: string;
  client_event_id: string;
  original_occurred_at: string | null;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  distance_m: string | null;
  photo: string | null;
  watermarked_photo?: string | null;
  note: string;
  geofence_result: "INSIDE" | "OUTSIDE" | "NOT_EVALUATED";
  matched_geofence: string | null;
  matched_geofence_name: string | null;
  created_at: string;
}

export interface AttendancePayload {
  project: string;
  event: AttendanceEvent;
  original_occurred_at?: string;
  client_event_id?: string;
  latitude?: string;
  longitude?: string;
  location_accuracy_m?: string;
  photo?: File;
  note?: string;
}

export type FieldPositionEvent =
  | "POSITION"
  | "GEOFENCE_ENTER"
  | "GEOFENCE_EXIT"
  | "SHARING_STOPPED";

export interface FieldStaffPosition {
  id: string;
  project: string;
  project_code: string;
  project_name: string;
  project_latitude: string | null;
  project_longitude: string | null;
  project_geofence_radius_m: number | null;
  user: string;
  user_name: string;
  client_event_id: string;
  event_type: FieldPositionEvent;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  original_occurred_at: string;
  uploaded_at: string;
  distance_to_project_m: string | null;
  geofence_result: "INSIDE" | "OUTSIDE" | "NOT_EVALUATED";
  matched_geofence: string | null;
  matched_geofence_name: string | null;
  coordinates_are_last_in_geofence?: boolean;
  is_stale: boolean;
  created_at: string;
}

export interface ProgressUpdate {
  id: string;
  project: string;
  project_name: string;
  title: string;
  description: string;
  percent_complete: string;
  reported_at: string;
  photo: string | null;
  watermarked_photo?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProgressPayload {
  project: string;
  title: string;
  description?: string;
  percent_complete: string;
  reported_at?: string;
  photo?: File;
  notify_users?: string[];
}

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "ASSIGNED"
  | "RECTIFICATION_SUBMITTED"
  | "RETURNED"
  | "VERIFIED"
  | "RESOLVED";

export interface SafetyRectificationEvidence {
  id: string;
  kind: "INCIDENT" | "RECTIFICATION" | "VERIFICATION";
  image: string;
  watermarked?: string | null;
  note: string;
  captured_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  device_id: string;
  client_event_id: string;
  submitted_by_name: string | null;
}

export interface SafetyIncident {
  id: string;
  incident_no: string;
  project: string;
  project_name: string;
  category: string | null;
  category_code: string | null;
  category_name: string | null;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurred_at: string;
  client_event_id: string;
  latitude: string | null;
  longitude: string | null;
  photo: string | null;
  watermarked_photo?: string | null;
  initial_evidence: SafetyRectificationEvidence[];
  resolution_note: string;
  resolved_at: string | null;
  responsible_person: string | null;
  responsible_person_name: string | null;
  rectification_due_at: string | null;
  /**
   * How long the work is expected to take, which the due date cannot say.
   *
   * The supervisor reads the deadline; the person holding the tools reads
   * this. 「需要知道什么时候会改，需要多少时间」 - two questions, two answers.
   */
  rectification_duration_hours?: string | null;
  rectification_note: string;
  rectification_submitted_at: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  review_note: string;
  rectification_evidence: SafetyRectificationEvidence[];
  notified_users: string[];
  notified_user_names: string[];
  created_by: string;
  photographer_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One message in a hazard's conversation.
 *
 * A hazard *is* its chat room rather than having one beside it: 「聊天室其实就
 * 是隐患上报结合一起而已，拍的照片也会发去聊天室，不是分开的」. The photograph
 * that raised the hazard arrives here as the first message, so the history is
 * whole from the first second.
 */
export interface HazardMessage {
  id: string;
  incident: string | null;
  thread: string | null;
  author: string;
  author_name: string;
  body: string;
  photo: string | null;
  watermarked_photo?: string | null;
  /** A voice note. Not an extra: the customer's crew 「不识字」 (D-094). */
  audio: string | null;
  audio_seconds: number | null;
  attachment: string | null;
  attachment_name: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  sent_at: string;
  client_event_id: string;
  created_at: string;
}

export interface HazardParticipant {
  id: string;
  full_name: string;
  role_name: string;
  is_supervisor: boolean;
  is_reporter: boolean;
  is_responsible: boolean;
}

export interface HazardConversation {
  incident: SafetyIncident;
  messages: HazardMessage[];
  participants: HazardParticipant[];
  /** Archived, which means readable but closed to new messages. */
  is_closed: boolean;
  audio_seconds_limit: number;
}

export interface SafetyIncidentPayload {
  project: string;
  /** Every safety report is filed under its project's safety column. */
  category: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  occurred_at?: string;
  client_event_id?: string;
  field_task?: string;
  latitude?: string;
  longitude?: string;
  photos?: File[];
  notify_users?: string[];
}

/** One worker currently inside a project's geofence. */
export interface WorkforcePresencePerson {
  user_id: string;
  full_name: string;
  phone: string;
  project_id: string;
  project_name: string;
  department_id: string | null;
  department_name: string;
  trade_id: string | null;
  trade_name: string;
  since: string;
}

/**
 * The headcount requirement 15.2.3 asks for.
 *
 * `by_department` and `by_trade` are keyed by name; the empty-string key is
 * everyone with that field unset, which is why the parts always sum to
 * `on_site_now` rather than quietly dropping the unassigned.
 */
export interface WorkforcePresence {
  on_site_now: number;
  entered_today: number;
  left_today: number;
  by_department: Record<string, number>;
  by_trade: Record<string, number>;
  people: WorkforcePresencePerson[];
}
