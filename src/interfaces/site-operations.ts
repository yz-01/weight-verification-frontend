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
  latitude: string;
  longitude: string;
  accuracy_m: string | null;
  original_occurred_at: string;
  uploaded_at: string;
  distance_to_project_m: string | null;
  geofence_result: "INSIDE" | "OUTSIDE" | "NOT_EVALUATED";
  matched_geofence: string | null;
  matched_geofence_name: string | null;
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
  kind: "RECTIFICATION" | "VERIFICATION";
  image: string;
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
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurred_at: string;
  client_event_id: string;
  latitude: string | null;
  longitude: string | null;
  photo: string | null;
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
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SafetyIncidentPayload {
  project: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  occurred_at?: string;
  client_event_id?: string;
  latitude?: string;
  longitude?: string;
  photo?: File;
}
