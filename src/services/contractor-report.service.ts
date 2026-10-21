import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ContractorReportData,
  ContractorReportExportRecord,
  ContractorReportFilterOptions,
  ContractorReportFilters,
  PhotoGroupPage,
  ContractorReportOptions,
  ContractorReportType,
  ReportLevelRow,
} from "@/interfaces/contractor-report";
import { api, download } from "@/services/api-client";

export function getContractorReportOptions(): Promise<ContractorReportOptions> {
  return api.get("/api/contractor-reports/get_filter_options/");
}

/** One level of the report menu under a report, or under a parent row (D6). */
export async function getReportCategories(query: {
  report_type: ContractorReportType;
  project?: string;
  parent?: string;
}): Promise<ReportLevelRow[]> {
  const data = await api.get<{ results: ReportLevelRow[] }>(
    "/api/contractor-reports/get_report_categories/",
    query as unknown as ListQuery,
  );
  return data.results;
}

/** One report's filter bar: its filters and their choices (2026-10-10). */
export function getReportFilters(query: {
  report_type: ContractorReportType;
  project?: string;
}): Promise<ContractorReportFilterOptions> {
  return api.get(
    "/api/contractor-reports/get_report_filters/",
    query as unknown as ListQuery,
  );
}

export function getContractorReport(
  filters: ContractorReportFilters,
): Promise<ContractorReportData> {
  return api.get(
    "/api/contractor-reports/get_report/",
    filters as unknown as ListQuery,
  );
}

/** 照片报表 (J8): one row per record, its photographs side by side. */
export function getPhotoGroups(
  filters: ContractorReportFilters & { page?: number; page_size?: number },
): Promise<PhotoGroupPage> {
  return api.get("/api/contractor-reports/get_photo_groups/", filters as unknown as ListQuery);
}

/**
 * The photo report as a file (J8-5): ``evidence`` is each record's complete
 * evidence report in one PDF; ``xlsx`` / ``pdf`` one record per row.
 */
export function exportPhotoGroups(
  input: ContractorReportFilters & {
    format: "evidence" | "xlsx" | "pdf";
    title: string;
    columns?: Array<{ key: string; label: string; values?: Record<string, string> }>;
  },
): Promise<void> {
  return download("/api/contractor-reports/export_photo_groups/", {
    method: "POST",
    body: input,
    fallbackFilename: input.format === "xlsx" ? "photo-report.xlsx" : "photo-report.pdf",
  });
}

export function getContractorReportHistory(
  query: ListQuery = {},
): Promise<Paginated<ContractorReportExportRecord>> {
  return api.list("/api/contractor-reports/get_export_history/", query);
}

/** The latest day a daily report covers - where 「日报告」 opens (I8, ID24). */
export function getLatestReportDay(query: {
  report_type: "daily_report";
  project?: string;
}): Promise<{ day: string | null }> {
  return api.get(
    "/api/contractor-reports/get_latest_day/",
    query as unknown as ListQuery,
  );
}

export function exportContractorReport(
  input: ContractorReportFilters & {
    format: "PDF" | "EXCEL";
    title: string;
    subtitle: string;
    column_labels: Record<string, string>;
    /** The language a report printed whole is worded in (日报告, 项目进度摘要). */
    lang?: string;
  },
): Promise<void> {
  return download("/api/contractor-reports/export_report/", {
    method: "POST",
    body: input,
    fallbackFilename:
      input.format === "PDF" ? "contractor-report.pdf" : "contractor-report.xlsx",
  });
}
