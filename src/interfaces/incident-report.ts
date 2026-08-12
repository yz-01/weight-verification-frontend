export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface IncidentReportThread {
  id: string;
  thread_no: string;
  title: string;
  severity: IncidentSeverity;
  occurred_at: string;
  project: string;
  project_name: string;
  reported_by: string;
  reported_by_name: string;
  recipients: IncidentReportRecipient[];
  latitude: string | null;
  longitude: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  message_count: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface IncidentReportRecipient {
  id: string;
  full_name: string;
  role_name: string;
  is_supervisor?: boolean;
}

export interface IncidentReportMessage {
  id: string;
  thread: string;
  author: string;
  author_name: string;
  body: string;
  photo: string | null;
  watermarked_photo: string | null;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  sent_at: string;
  client_event_id: string;
  created_at: string;
}

export interface IncidentReportThreadPayload {
  project: string;
  title: string;
  severity: IncidentSeverity;
  description: string;
  recipient_ids: string[];
  occurred_at?: string;
  latitude?: string;
  longitude?: string;
}

export interface IncidentReportMessagePayload {
  body: string;
  photo?: File;
  latitude?: string;
  longitude?: string;
  accuracy_m?: string;
  client_event_id?: string;
}
