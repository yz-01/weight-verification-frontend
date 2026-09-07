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
    /** Every direction together. Kept; the two below say which way. */
    equipment_movements: number;
    equipment_entries: number;
    equipment_exits: number;
    /**
     * Deliveries filed today. A delivery a correction has superseded counts
     * once, not twice.
     */
    material_receipts: number;
    /** Deliveries sent back to the supplier today. */
    material_returns: number;
    /**
     * Deliveries nobody has accepted or rejected yet, and ones that failed.
     *
     * Current state, not a daily count: a delivery nobody has inspected since
     * Tuesday is exactly what the card is for. Filtering these to today would
     * report zero every morning while the pile was still there - the mistake
     * the notification card made (F-229).
     */
    material_pending_acceptance: number;
    material_rejected: number;
    /**
     * Machines whose certificate or insurance runs out inside the window, or
     * already has. Already-expired ones are included on purpose: a card that
     * only counted "expiring soon" would go quiet the day the problem became
     * real.
     */
    equipment_expiring: number;
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
    /** Actual minus planned. Negative is behind. */
    variance: string;
    /**
     * What the percentages were calculated from.
     *
     * A 25% drawn from forty weighted tasks and a 25% drawn from the one task
     * somebody typed a number into look identical without these (F-226).
     */
    counted_tasks: number;
    summary_rows_excluded: number;
    total_weight: string;
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
  /**
   * How long this has been waiting, in seconds, measured on the server.
   *
   * Null when the row carries no usable timestamp. Computed there rather than
   * here so a device with a wrong clock does not answer differently, and
   * derived from the same timestamp `submitted_at` shows so the two cannot
   * disagree on screen.
   */
  waiting_seconds: number | null;
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
  /**
   * Counted from the query rather than from the list above, which is cut at
   * fifty. The three lists and the four totals are deliberately separate: a
   * site with sixty overdue rectifications used to report fifty.
   */
  geofence_total: number;
  /**
   * How many days back the out-of-bounds figure looked.
   *
   * On the screen because a number whose span is not stated is how this card
   * got into trouble: it counted one day under a heading that read like it
   * counted everything.
   */
  geofence_window_days: number;
  overdue_total: number;
  expiring_permits_total: number;
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
  /**
   * Workers whose last event of the day was a clock-in.
   *
   * Not the number of clock-ins: one worker can clock in twice, and a worker
   * who has gone home still contributed one.
   */
  on_site_now: number;
  entered: number;
  left: number;
  irregular: number;
  irregular_breakdown: {
    outside_geofence: number;
    out_of_order: number;
    /** Clocked in and never out, counted only once the day is over. */
    without_exit: number;
  };
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
    /** Unread, newest first. Not "created today" - see `today`. */
    rows: NotificationRow[];
    total: number;
    unread: number;
    /** How many arrived today, so the card can say both without confusing them. */
    today: number;
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
