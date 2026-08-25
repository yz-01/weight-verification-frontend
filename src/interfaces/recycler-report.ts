export type RecyclerReportType =
  | "orders"
  | "weights"
  | "sources"
  | "commission"
  | "weighing"
  | "inventory"
  | "outbound"
  | "customers"
  | "fleet"
  | "exceptions";

export interface RecyclerReportRow {
  reference: string;
  date: string;
  category: string;
  party: string;
  status: string;
  quantity: string;
  detail: string;
}

export interface RecyclerReportData {
  report_type: RecyclerReportType;
  period: { from: string; to: string };
  filters: Record<string, string>;
  count: number;
  summary: Array<{
    key: string;
    value: string | number;
    unit: "count" | "kg" | "money";
  }>;
  rows: RecyclerReportRow[];
  generated_at: string;
}

export interface RecyclerReportOptions {
  report_types: RecyclerReportType[];
  projects: Array<{ id: string; code: string; name: string }>;
  customers: Array<{
    id: string;
    customer_no: string;
    company_name: string;
    customer_type: string;
  }>;
  materials: Array<{ value: string; label: string }>;
  drivers: Array<{ id: string; driver_no: string; full_name: string }>;
  vehicles: Array<{ id: string; plate_no: string }>;
  scales: Array<{ id: string; code: string; name: string }>;
  business_sources: string[];
  states: string[];
  states_by_report: Partial<Record<RecyclerReportType, string[]>>;
}

export interface RecyclerReportExport {
  id: string;
  report_type: RecyclerReportType;
  export_format: "PDF" | "EXCEL";
  date_from: string;
  date_to: string;
  filters: Record<string, string>;
  file_name: string;
  metric_count: number;
  generated_by_name: string;
  generated_by_email: string;
  created_at: string;
}

export interface RecyclerReportFilters extends ListQuery {
  report_type: RecyclerReportType;
  date_from: string;
  date_to: string;
  project?: string;
  customer?: string;
  material_type?: string;
  driver?: string;
  vehicle?: string;
  scale?: string;
  state?: string;
  business_source?: string;
}
import type { ListQuery } from "@/interfaces/api";
