export type SchedulePlanStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type ScheduleRevisionStatus = "DRAFT" | "CONFIRMED";
export type ScheduleRevisionKind = "BASELINE" | "REVISION";
export type ScheduleSource = "MANUAL" | "EXCEL";

export interface SchedulePlan {
  id: string;
  project: string;
  project_name: string;
  name: string;
  description: string;
  status: SchedulePlanStatus;
  revision_count: number;
  current_revision_id: string | null;
  current_revision_label: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRevision {
  id: string;
  plan: string;
  plan_name: string;
  project: string;
  project_name: string;
  revision_number: number;
  kind: ScheduleRevisionKind;
  label: string;
  reason: string;
  source: ScheduleSource;
  status: ScheduleRevisionStatus;
  is_current: boolean;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  task_count: number;
  planned_start: string | null;
  planned_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleProgressLink {
  id: string;
  progress_record: string;
  progress_description: string;
  progress_percent: string;
  progress_captured_at: string;
  created_at: string;
}

export interface ScheduleTask {
  id: string;
  project: string;
  revision: string;
  revision_label: string;
  parent: string | null;
  parent_wbs_code: string | null;
  wbs_code: string;
  name: string;
  description: string;
  planned_start: string;
  planned_end: string;
  duration_days: number;
  sort_order: number;
  planned_progress: string;
  actual_progress: string;
  actual_start: string | null;
  actual_end: string | null;
  delay_days: number;
  is_delayed: boolean;
  progress_note: string;
  progress_confirmed_by: string | null;
  progress_confirmed_by_name: string | null;
  progress_confirmed_at: string | null;
  progress_links: ScheduleProgressLink[];
  created_at: string;
  updated_at: string;
}

export interface ScheduleOverview {
  plan_id: string;
  revision: ScheduleRevision | null;
  summary: {
    task_count?: number;
    completed_count?: number;
    delayed_count?: number;
    planned_progress?: string;
    actual_progress?: string;
    planned_start?: string | null;
    planned_end?: string | null;
  };
}

export interface ScheduleImportPreview {
  id: string;
  project: string;
  project_name: string;
  plan: string | null;
  plan_name: string | null;
  original_filename: string;
  sheet_name: string;
  header_row: number;
  headers: string[];
  preview_rows: Array<Record<string, string | number | null>>;
  suggested_mapping: Record<string, string>;
  confirmed_mapping: Record<string, string>;
  status: "PREVIEWED" | "IMPORTED" | "FAILED";
  errors: string[];
  imported_revision: string | null;
  expires_at: string;
  created_at: string;
}

export interface ScheduleHistoryEntry {
  id: string;
  plan: string;
  revision: string | null;
  revision_label: string | null;
  task: string | null;
  task_name: string | null;
  event: string;
  note: string;
  snapshot: Record<string, unknown>;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface ProgressCandidate {
  id: string;
  phase_name: string;
  description: string;
  percent_complete: string;
  captured_at: string;
  submitted_by_name: string;
}

export interface ScheduleTaskPayload {
  revision: string;
  parent?: string | null;
  wbs_code: string;
  name: string;
  description?: string;
  planned_start: string;
  planned_end: string;
  sort_order?: number;
}
