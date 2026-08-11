import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  AdminReportData,
  AdminReportFilterOptions,
  AdminReportFilters,
  ReportExportRecord,
} from "@/interfaces/admin-report";
import { api, download } from "@/services/api-client";

export function getAdminReport(filters: AdminReportFilters): Promise<AdminReportData> {
  return api.get<AdminReportData>(
    "/api/report-center/get_report/",
    filters as unknown as ListQuery,
  );
}

export function getAdminReportFilterOptions(): Promise<AdminReportFilterOptions> {
  return api.get<AdminReportFilterOptions>(
    "/api/report-center/get_filter_options/",
  );
}

export function getAdminReportHistory(
  query: ListQuery = {},
): Promise<Paginated<ReportExportRecord>> {
  return api.list<ReportExportRecord>(
    "/api/report-center/get_export_history/",
    query,
  );
}

export function exportAdminReport(
  input: AdminReportFilters & {
    format: "PDF" | "EXCEL";
    title: string;
    subtitle: string;
    metric_label: string;
    value_label: string;
    unit_label: string;
    metric_labels: Record<string, string>;
  },
): Promise<void> {
  return download("/api/report-center/export_report/", {
    method: "POST",
    body: input,
    fallbackFilename:
      input.format === "PDF" ? "mse-report.pdf" : "mse-report.xlsx",
  });
}
