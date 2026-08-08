import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ContractorReportData,
  ContractorReportExportRecord,
  ContractorReportFilters,
  ContractorReportOptions,
} from "@/interfaces/contractor-report";
import { api, download } from "@/services/api-client";

export function getContractorReportOptions(): Promise<ContractorReportOptions> {
  return api.get("/api/contractor-reports/get_filter_options/");
}

export function getContractorReport(
  filters: ContractorReportFilters,
): Promise<ContractorReportData> {
  return api.get(
    "/api/contractor-reports/get_report/",
    filters as unknown as ListQuery,
  );
}

export function getContractorReportHistory(
  query: ListQuery = {},
): Promise<Paginated<ContractorReportExportRecord>> {
  return api.list("/api/contractor-reports/get_export_history/", query);
}

export function exportContractorReport(
  input: ContractorReportFilters & {
    format: "PDF" | "EXCEL";
    title: string;
    subtitle: string;
    column_labels: Record<string, string>;
  },
): Promise<void> {
  return download("/api/contractor-reports/export_report/", {
    method: "POST",
    body: input,
    fallbackFilename:
      input.format === "PDF" ? "contractor-report.pdf" : "contractor-report.xlsx",
  });
}
