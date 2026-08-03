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
  original_occurred_at: string | null;
  uploaded_at: string;
  client_event_id: string;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  photo: string | null;
  note: string;
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
  | "GEOFENCE_EXIT";

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
export type IncidentStatus = "OPEN" | "INVESTIGATING" | "RESOLVED";

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
  latitude: string | null;
  longitude: string | null;
  photo: string | null;
  resolution_note: string;
  resolved_at: string | null;
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
  latitude?: string;
  longitude?: string;
  photo?: File;
}
