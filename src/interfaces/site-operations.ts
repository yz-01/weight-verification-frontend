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
