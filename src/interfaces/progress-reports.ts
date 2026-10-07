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
  percent_complete: string;
}

export interface DailyReport {
  id: string;
  project: string;
  project_name: string;
  /** 日报名称 */
  name: string;
  body: string;
  report_date: string;
  photos: ProgressPhoto[];
  photo_count: number;
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
  photo_ids: string[];
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
