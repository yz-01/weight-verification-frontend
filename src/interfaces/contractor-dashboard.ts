/** The contractor daily operations dashboard aggregate. */

/** Sections the endpoint can build. Omitting `sections` returns all of them. */
export type ContractorDashboardSection =
  | "overview"
  | "activity"
  | "approvals"
  | "unread"
  | "rectifications"
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
    /**
     * Clock-ins outside the fence since `geofence_since` (the last
     * `geofence_window_days` days). Moved here off the old 「待处理异常」
     * card (C15); opens the attendance list from that day.
     */
    geofence_failures: number;
    geofence_window_days: number;
    geofence_since: string;
    /** Approved site passes running out within the week (C15). */
    expiring_permits: number;
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
  /** The record's own id, so the row can open it. Absent from older servers. */
  id?: string;
  kind: ActivityKind;
  occurred_at: string | null;
  project: string;
  reference: string;
  summary: string;
  status: string;
}

export interface ApprovalRow {
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  approval_no: string;
  title: string;
  status: string;
  project: string;
  /** Empty for a company-wide approval, which belongs to no project. */
  project_id?: string;
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

/** What the reader is asked to do next on an open item. */
export type RectificationStep = "ASSIGN" | "RECTIFY" | "CONFIRM";

/** One open hazard or permit the reader moves on (C15). */
export interface RectificationRow {
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  /** Always `SAFETY_INCIDENT`: the kind `recordTarget` opens it by. */
  kind: string;
  incident_no: string;
  title: string;
  record_type: "HAZARD" | "PERMIT";
  severity: string;
  status: string;
  next_step: RectificationStep;
  project: string;
  project_id: string;
  occurred_at: string | null;
  rectification_due_at: string | null;
  /** Null when it has no deadline or is not past it. */
  days_overdue: number | null;
}

/**
 * 「待处理整改 / EHS」: open hazards and permits (OPEN / ASSIGNED / RETURNED /
 * RECTIFICATION_SUBMITTED) that wait on this reader - to assign, to put right
 * or to confirm. Geofence breaches and expiring passes are on the overview.
 */
export interface DashboardRectifications {
  rows: RectificationRow[];
  /** Counted from the query; `rows` stops at fifty. */
  total: number;
  /** How many of `total` are past their deadline. */
  overdue: number;
}

export interface NotificationRow {
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  kind: string;
  /** The kind by name, in the reader's language (T-176). */
  kind_label: string;
  title: string;
  message: string;
  created_at: string | null;
  state: string;
  /**
   * The record the notice is about, by its record-centre kind, and its id -
   * what the thumbnail opens (audit #4). Null for a notice about no record.
   */
  subject_kind: string | null;
  subject_id: string | null;
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
  /** How many photographs the record has (E3). */
  photo_count?: number;
  /** The record the row opens. Absent from older servers. */
  id?: string;
  at: string | null;
  kind: string;
  project: string;
  label: string;
  severity: "INFO" | "WARNING" | "DANGER";
  /** E3's cover photo, shown as a 40x40 thumbnail when present. */
  cover_photo_url?: string | null;
}

/** One record in 「等你处理」: finished, not yet confirmed (X10, C4). */
export interface WaitingRecord {
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  /** The record kind, as the archive queue names it (`MATERIAL_RECEIPT`, `PROGRESS`...). */
  kind: string;
  id: string;
  reference: string;
  title: string;
  project: string;
  project_id: string;
  waiting_since: string | null;
}

/**
 * 「等你处理」: records this reader may confirm that nobody has confirmed yet
 * (X10). Not RecordSeen any more - a confirmation clears it for everybody.
 */
export interface DashboardUnread {
  total: number;
  by_kind: Record<string, number>;
  rows: WaitingRecord[];
  /** Deliveries waiting for a confirmation: the 材料进场 sidebar badge. */
  receipts: number;
  /** Decisions waiting on this reader: the 待审批 sidebar badge, not part of `total`. */
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
  /** 「等你处理」 - see `DashboardUnread`. */
  unread?: DashboardUnread;
  /** 「待处理整改 / EHS」 - see `DashboardRectifications`. */
  rectifications?: DashboardRectifications;
  notifications?: {
    /** Still outstanding, newest first. Not "created today" - see `today`. */
    rows: NotificationRow[];
    total: number;
    /** Of the outstanding pile, how many arrived today (D-206). */
    today: number;
    /** The rest of it. `today + earlier === total`. */
    earlier: number;
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
