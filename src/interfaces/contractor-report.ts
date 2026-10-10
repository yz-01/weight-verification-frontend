import type { Paginated } from "@/interfaces/api";
import type { ArchivedReportFile } from "@/interfaces/report-archive";

export type ContractorReportType =
  | "progress"
  | "safety"
  | "consultant"
  | "attendance"
  | "equipment"
  | "recycling"
  | "schedule"
  | "target"
  | "photos"
  | "documents";

export interface ContractorReportFilters {
  report_type: ContractorReportType;
  date_from?: string;
  date_to?: string;
  project?: string;
  /** The report menu's level under the report (D6). */
  category?: string;
  /** Its level below that, for equipment and documents. */
  subcategory?: string;
  actor?: string;
  keyword?: string;
  /** The filter bar (2026-10-10): each report reads only its own. */
  status?: string;
  event?: string;
  geofence?: string;
  equipment?: string;
  supplier?: string;
  direction?: string;
  record_type?: string;
  counterparty?: string;
  plan?: string;
  target_type?: string;
}

/** A filter of the report centre's filter bar (`lib/report-filters`). */
export type ReportFilterKey =
  | "status"
  | "actor"
  | "event"
  | "geofence"
  | "equipment"
  | "supplier"
  | "direction"
  | "record_type"
  | "counterparty"
  | "plan"
  | "target_type";

/**
 * One choice of a filter. `label` is a name (a person, a machine) or, for a
 * code, the code itself, which the screen words in the reader's language.
 */
export interface ReportFilterOption {
  value: string;
  label: string;
  /** A recycling status, worded by the record type it belongs to. */
  record_type?: string;
}

/** `get_report_filters`: the report's filters and the choices of each. */
export interface ContractorReportFilterOptions {
  report_type: ContractorReportType;
  filters: ReportFilterKey[];
  options: Partial<Record<ReportFilterKey, ReportFilterOption[]>>;
}

export interface ContractorReportData {
  report_type: ContractorReportType;
  period: { from: string; to: string };
  project: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  /** Each row's record, link and photograph, in the rows' order. */
  records?: ContractorReportRecord[];
  total: number;
  truncated: boolean;
  generated_at: string;
}

/**
 * What a preview row is, beside its columns: the record it opens and its
 * first photograph (the small stamped thumbnail). `kind` is `null` for a row
 * that is not one record anywhere (a schedule task, a target).
 */
export interface ContractorReportRecord {
  kind: string | null;
  id: string | null;
  project_id: string | null;
  /** A clock-in opens that person's day in 人员进场记录. */
  user_id: string | null;
  date: string | null;
  cover_photo_url: string | null;
  photo_count: number;
}

export interface ContractorReportOptions {
  report_types: ContractorReportType[];
  projects: Array<{ id: string; code: string; name: string }>;
  photo_categories: Array<{ value: string; label: string }>;
  photo_uploaders: Array<{ id: string; name: string }>;
}

/** One row of a report menu level (D6): what to filter by and its name. */
export interface ReportLevelRow {
  value: string;
  label: string;
  /** Beside a name two projects share, when no project is chosen. */
  project_code: string;
  /** Whether hovering it opens another level. */
  has_children: boolean;
}

/** One row of 报表导出历史, and the file it keeps (`ArchivedReportFile`). */
export interface ContractorReportExportRecord extends ArchivedReportFile {
  id: string;
  /** `dashboard`: the 现场看板 export, kept in the same history. */
  report_type: ContractorReportType | "dashboard";
  export_format: "PDF" | "EXCEL";
  date_from: string;
  date_to: string;
  filters: { project?: string };
  file_name: string;
  metric_count: number;
  project: string | null;
  project_name: string | null;
  generated_by_name: string;
  generated_by_email: string;
  created_at: string;
}

export type ContractorReportHistory = Paginated<ContractorReportExportRecord>;
