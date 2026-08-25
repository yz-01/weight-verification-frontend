import type {
  RecyclerReportData,
  RecyclerReportExport,
  RecyclerReportFilters,
  RecyclerReportOptions,
} from "@/interfaces/recycler-report";
import { api, download } from "@/services/api-client";

export function getRecyclerReportOptions(): Promise<RecyclerReportOptions> {
  return api.get("/api/recycler-report-center/get_filter_options/");
}

export function getRecyclerReport(
  filters: RecyclerReportFilters,
): Promise<RecyclerReportData> {
  return api.get("/api/recycler-report-center/get_report/", filters);
}

export function exportRecyclerReport(
  filters: RecyclerReportFilters,
  format: "PDF" | "EXCEL",
): Promise<void> {
  return download("/api/recycler-report-center/export_report/", {
    method: "POST",
    body: { ...filters, format, title: filters.report_type },
    fallbackFilename: `${filters.report_type}.${format === "PDF" ? "pdf" : "xlsx"}`,
  });
}

export function getRecyclerReportExports(): Promise<{
  count: number;
  results: RecyclerReportExport[];
}> {
  return api.get("/api/recycler-report-center/get_export_history/");
}
