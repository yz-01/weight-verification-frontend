/**
 * 日报告, 项目进度摘要 and the 现场照片 list behind them (2026-10 B17).
 * Mirrors `contractor_ops/progress_reports.py`.
 */

/** One progress photograph with the record and 施工分类 it belongs to. */
export interface ProgressPhoto {
  id: string;
  image: string;
  watermarked: string | null;
  caption: string;
  captured_at: string | null;
  latitude: string | null;
  longitude: string | null;
  project: string;
  project_name: string;
  /** The progress record the photo was taken for. */
  progress: string;
  phase: string;
  phase_name: string;
  /** Null when the site left it out (H5/H11, HD2). */
  percent_complete: string | null;
  /** The record's note from the site (H14), on the card as well as the detail. */
  description?: string;
}

/**
 * One progress record in a daily report (H15, HD12): the site's note and all
 * its photographs.
 */
export interface DailyReportEntry {
  id: string;
  captured_at: string | null;
  phase: string;
  phase_name: string;
  /** Null when the site left it out (HD2). */
  percent_complete: string | null;
  /** The site's note (H14) - what 「带入这几天的备注」 brings in. */
  description: string;
  status: string;
  recorded_by_name: string | null;
  /** Deleted after the report was saved: the report still holds it (D4). */
  is_deleted?: boolean;
  photos: ProgressPhoto[];
}

/**
 * A daily report: every progress record and photograph of its days (H15,
 * HD12), frozen when saved. A list row (`compact`) carries the counts only;
 * `entries` and `photos` arrive when one report is opened.
 */
export interface DailyReport {
  id: string;
  project: string;
  project_name: string;
  /** 日报名称 */
  name: string;
  body: string;
  /** The first day the report covers. */
  report_date: string;
  /** The last day; null when the report covers `report_date` only. */
  end_date: string | null;
  photos: ProgressPhoto[];
  photo_count: number;
  record_count: number;
  entries: DailyReportEntry[];
  /** When its records were collected; null for a report from before H15 (photos ticked by hand). */
  collected_at: string | null;
  author: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyReportPayload {
  project: string;
  name: string;
  body: string;
  report_date: string;
  end_date: string | null;
  /** 「重新整理」: collect the report's days again when saving. */
  recollect?: boolean;
}

/** What a report of these days would hold, before it is saved. */
export interface DailyReportCollection {
  entries: DailyReportEntry[];
  record_count: number;
  photo_count: number;
}

export type SummaryBlockType = "text" | "photos" | "number" | "chart";

export interface SummaryTextBlock {
  id: string;
  type: "text";
  text: string;
}

export interface SummaryPhotosBlock {
  id: string;
  type: "photos";
  caption: string;
  photo_ids: string[];
  /** Filled in by the server on the way out; never sent back. */
  photos?: ProgressPhoto[];
}

export interface SummaryNumberBlock {
  id: string;
  type: "number";
  label: string;
  value: string;
  unit: string;
  note: string;
}

export interface SummaryChartPoint {
  label: string;
  value: number | string;
}

export interface SummaryChartBlock {
  id: string;
  type: "chart";
  chart: "bar" | "line";
  title: string;
  series: string;
  points: SummaryChartPoint[];
}

export type SummaryBlock =
  | SummaryTextBlock
  | SummaryPhotosBlock
  | SummaryNumberBlock
  | SummaryChartBlock;

export interface ProgressSummary {
  id: string;
  project: string;
  project_name: string;
  title: string;
  blocks: SummaryBlock[];
  author: string | null;
  author_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}
