import type { Paginated } from "@/interfaces/api";

export type ContractorReportType =
  | "progress"
  | "safety"
  | "consultant"
  | "attendance"
  | "equipment"
  | "recycling"
  | "schedule"
  | "target";

export interface ContractorReportFilters {
  report_type: ContractorReportType;
  date_from?: string;
  date_to?: string;
  project?: string;
}

export interface ContractorReportData {
  report_type: ContractorReportType;
  period: { from: string; to: string };
  project: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  total: number;
  truncated: boolean;
  generated_at: string;
}

export interface ContractorReportOptions {
  report_types: ContractorReportType[];
  projects: Array<{ id: string; code: string; name: string }>;
}

export interface ContractorReportExportRecord {
  id: string;
  report_type: ContractorReportType;
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
