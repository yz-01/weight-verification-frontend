import type { Paginated } from "@/interfaces/api";

export type AdminReportType =
  | "contractors"
  | "recyclers"
  | "business"
  | "saas"
  | "commission"
  | "cwe"
  | "operations";

export interface AdminReportFilters {
  report_type: AdminReportType;
  date_from?: string;
  date_to?: string;
  company?: string;
  project?: string;
  state?: string;
}

export interface AdminReportMetric {
  key: string;
  value: string | number;
  unit: "count" | "kg" | "MYR" | "percent";
}

export interface AdminReportData {
  report_type: AdminReportType;
  period: { from: string; to: string };
  filters: { company: string; project: string; state: string };
  metrics: AdminReportMetric[];
  generated_at: string;
}

export interface AdminReportFilterOptions {
  report_types: AdminReportType[];
  companies: Array<{
    id: string;
    code: string;
    name: string;
    type: "CONTRACTOR" | "RECYCLER";
    state: string;
  }>;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    company: string;
    state: string;
  }>;
  states: string[];
}

export interface ReportExportRecord {
  id: string;
  report_type: AdminReportType;
  export_format: "PDF" | "EXCEL";
  date_from: string;
  date_to: string;
  filters: { company?: string; project?: string; state?: string };
  file_name: string;
  metric_count: number;
  generated_by_name: string;
  generated_by_email: string;
  created_at: string;
}

export type ReportExportHistory = Paginated<ReportExportRecord>;
