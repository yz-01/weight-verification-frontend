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
  | "documents"
  // 工程进度's own reports (I8, ID24).
  | "daily_report"
  | "progress_summary"
  // The four modules that had no report (I11, ID27).
  | "field_tasks"
  | "material_outgoing"
  | "claims"
  | "sundry_claims"
  // 材料退货记录（RN）and 材料不合格记录 (J29).
  | "material_returns"
  | "material_rejections";

/** One row of the photo report (J8): a record and every photograph of it. */
export interface PhotoGroup {
  key: string;
  /** The record's kind as the photo ledger names it; "" when it has none. */
  kind: string;
  record_id: string | null;
  /** Which complete evidence PDF it prints as; null when none. */
  export_kind: string | null;
  reference: string;
  project_id: string | null;
  project: string;
  date: string | null;
  uploaded_by: string;
  photo_count: number;
  has_gps: boolean;
  photos: Array<{
    id: string;
    url: string | null;
    thumbnail_url: string | null;
    captured_at: string | null;
    latitude: string | null;
    longitude: string | null;
  }>;
}

export interface PhotoGroupPage {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: PhotoGroup[];
  /** More photographs than the report reads at once matched the filters. */
  truncated: boolean;
}

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
  subcontractor?: string;
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
  | "target_type"
  // 分包商 on the Progress Claim report (I10, ID7).
  | "subcontractor"
  // 材料名称 and 规格 on the two material reports (J29).
  | "material"
  | "specification";

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
  /** 「已停用」 beside a category that is off but still has records (I11). */
  is_active?: boolean;
  /** A system 分类组 with no name of its own: named by its module (I11). */
  module?: string | null;
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
