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

export interface SafetyIncidentPayload {
  project: string;
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
