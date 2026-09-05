/** The contractor daily operations dashboard aggregate. */

/** Sections the endpoint can build. Omitting `sections` returns all of them. */
export type ContractorDashboardSection =
  | "overview"
  | "activity"
  | "approvals"
  | "unread"
  | "anomalies"
  | "notifications"
  | "personnel"
  | "photos"
  | "timeline";

export type ProjectStatusKey =
  | "PLANNING"
  | "ACTIVE"
  | "SUSPENDED"
  | "COMPLETED";

export interface DashboardOverview {
  projects: {
    total: number;
    by_status: Record<ProjectStatusKey, number>;
  };
  today: {
    progress_records: number;
    attendance_events: number;
    safety_incidents: number;
    equipment_movements: number;
    photos: number;
  };
  safety: {
    today_inspections: number;
    pending_rectification: number;
    in_progress: number;
    overdue: number;
    completed: number;
    recent_notes: Array<{
      id: string;
      incident_no: string;
      title: string;
      status: string;
      note: string;
    }>;
  };
  schedule: {
    active_plans: number;
    tasks: number;
    planned_progress: string;
    actual_progress: string;
    delayed_tasks: number;
    completed_tasks: number;
    due_next_7_days: number;
  };
}

export type ActivityKind =
  | "MATERIAL_OUTGOING"
  | "EQUIPMENT_MOVEMENT"
  | "SITE_PROGRESS"
  | "DISPOSAL"
  | "WASTE_DISPATCH"
  | "SAFETY_INCIDENT"
  | "CONSULTANT_APPLICATION"
  | "FIELD_TASK";

export interface ActivityRow {
  kind: ActivityKind;
  occurred_at: string | null;
  project: string;
  reference: string;
  summary: string;
  status: string;
}

export interface ApprovalRow {
  id: string;
  approval_no: string;
  title: string;
  status: string;
  project: string;
  /**
   * Which queue this row came out of, from a closed set.
   *
   * Not the same thing as `resource_type`: on a row from the approval centre
   * that field is free text set by whoever raised the approval, so it cannot
   * be trusted to choose a destination.
   */
  source: string;
  resource_type: string;
  requested_by: string;
  assigned_to: string;
  submitted_at: string | null;
  created_at: string | null;
}

export interface GeofenceFailureRow {
  id: string;
  project: string;
  worker: string;
  event: string;
  occurred_at: string | null;
  distance_m: string | null;
  accuracy_m: string | null;
}

export interface OverdueRectificationRow {
  id: string;
  project: string;
  incident_no: string;
  title: string;
  severity: string;
  status: string;
  rectification_due_at: string | null;
  days_overdue: number;
}

export interface ExpiringPermitRow {
  id: string;
  project: string;
  pass_no: string;
  subject_name: string;
  valid_until: string | null;
  status: string;
}

export interface DashboardAnomalies {
  geofence_failures: GeofenceFailureRow[];
  overdue_rectifications: OverdueRectificationRow[];
  expiring_permits: ExpiringPermitRow[];
  total: number;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  message: string;
  created_at: string | null;
  read_at: string | null;
}

export interface DashboardPersonnel {
  by_event: Record<string, number>;
  unique_workers: number;
  geofence_failures: number;
  by_project: Array<{ project: string; events: number }>;
}

export interface PhotoRow {
  id: string;
  image: string | null;
  project: string;
  photographer: string;
  captured_at: string | null;
  uploaded_at: string | null;
  latitude: string | null;
  longitude: string | null;
  source_model: string;
  source_id: string;
}

export interface TimelineEntry {
  at: string | null;
  kind: string;
  project: string;
  label: string;
  severity: "INFO" | "WARNING" | "DANGER";
}

export interface UnreadColumn {
  /** Null for deliveries nobody has filed into a column yet. */
  category: string | null;
  name: string;
  code: string;
  count: number;
}

export interface DashboardUnread {
  receipts: number;
  columns: UnreadColumn[];
  approvals: number;
}

/** Every section is optional: `?sections=` narrows what the server builds. */
export interface ContractorDashboard {
  date: string;
  project: string;
  sections: ContractorDashboardSection[];
  generated_at: string;
  overview?: DashboardOverview;
  activity?: { rows: ActivityRow[]; total: number };
  approvals?: {
    rows: ApprovalRow[];
    total: number;
    mine: number;
    unassigned: number;
  };
  /**
   * What *this reader* has not looked at yet.
   *
   * Every number is answered for the person asking and nobody else: head
   * office and the project manager wait on the same delivery and clear it
   * separately, so a shared count would let whoever opened it first empty the
   * other's pile (D-063).
   */
  unread?: DashboardUnread;
  anomalies?: DashboardAnomalies;
  notifications?: {
    rows: NotificationRow[];
    total: number;
    unread: number;
    scope: string;
  };
  personnel?: DashboardPersonnel;
  photos?: { rows: PhotoRow[]; total: number };
  timeline?: { entries: TimelineEntry[]; total: number };
}

export interface DashboardSearchRow {
  kind: string;
  id: string;
  project: string;
  reference: string;
  status: string;
}

export interface DashboardSearchResult {
  term: string;
  rows: DashboardSearchRow[];
  total: number;
}
