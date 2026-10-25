/**
 * 现场照片, 日报告 and 项目进度摘要 - the progress page's tabs (2026-10 B17).
 */
import type { ListQuery } from "@/interfaces/api";
import type {
  DailyReport,
  DailyReportCollection,
  DailyReportPayload,
  ProgressPhoto,
  ProgressSummary,
  SummaryBlock,
} from "@/interfaces/progress-reports";
import { api, download, fetchAsFile, toastSuccess } from "@/services/api-client";
import { exportBody, exportQuery, type ExportRequest } from "@/services/contractor.service";

/** 现场照片: progress photographs by project, 施工分类 and day. */
export const getProgressPhotos = (query: ListQuery = {}) =>
  api.list<ProgressPhoto>("/api/site-progress/get_photos/", query);

/** The list: each report's counts, not its photographs (`compact`). */
export const getDailyReports = (query: ListQuery = {}) =>
  api.list<DailyReport>("/api/daily-reports/get_reports/", { ...query, compact: "1" });

export const getDailyReport = (id: string) =>
  api.get<DailyReport>(`/api/daily-reports/${id}/get_report/`);

/** The list of reports, as Excel or PDF (H16, HD13); each report has its own PDF. */
export function exportDailyReports(request: ExportRequest): Promise<void> {
  return download("/api/daily-reports/export_reports/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `daily-reports.${request.format}`,
  });
}

/** Every record and photograph of these days, as a report would hold them (H15). */
export const collectDailyReportEntries = (query: {
  project: string;
  date_from: string;
  date_to: string;
}) => api.get<DailyReportCollection>("/api/daily-reports/collect_entries/", query);

/** The report as a PDF, fetched once for 预览 · 打印 · 导出 · 发送 (H15). */
export const dailyReportPdfFile = (id: string, lang: string, name: string) =>
  fetchAsFile(`/api/daily-reports/${id}/get_report_pdf/`, {
    method: "GET",
    query: { lang },
    fallbackFilename: `${(name || "daily-report").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`,
  });

/**
 * Write a daily report. `signOffPin` is the sign-off PIN typed when the
 * editor opened (I29): sent again so it is typed once; the server checks it.
 */
export async function createDailyReport(payload: DailyReportPayload, signOffPin?: string) {
  const row = await api.post<DailyReport>("/api/daily-reports/create_report/", payload, {
    signOffPin: signOffPin || undefined,
  });
  toastSuccess("contractorOps.toast.saved");
  return row;
}

export async function updateDailyReport(
  id: string,
  payload: Partial<Omit<DailyReportPayload, "project">>,
  signOffPin?: string,
) {
  const row = await api.patch<DailyReport>(`/api/daily-reports/${id}/update_report/`, payload, {
    signOffPin: signOffPin || undefined,
  });
  toastSuccess("contractorOps.toast.saved");
  return row;
}

/** Removed with a reason (删除原因) and the sign-off PIN (I29). */
export async function deleteDailyReport(id: string, reason: string, signOffPin?: string) {
  await api.delete(`/api/daily-reports/${id}/delete_report/`, {
    body: { reason },
    signOffPin: signOffPin || undefined,
  });
  toastSuccess("contractorOps.toast.removed");
}

export const getProgressSummaries = (query: ListQuery = {}) =>
  api.list<ProgressSummary>("/api/progress-summaries/get_summaries/", query);

export const getProgressSummary = (id: string) =>
  api.get<ProgressSummary>(`/api/progress-summaries/${id}/get_summary/`);

/** The blocks as the server stores them: a photo group's photos stay behind. */
function storedBlocks(blocks: SummaryBlock[]) {
  return blocks.map((block) => {
    if (block.type !== "photos") return block;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { photos, ...rest } = block;
    return rest;
  });
}

export async function createProgressSummary(payload: {
  project: string;
  title: string;
  blocks: SummaryBlock[];
}) {
  const row = await api.post<ProgressSummary>("/api/progress-summaries/create_summary/", {
    ...payload,
    blocks: storedBlocks(payload.blocks),
  });
  toastSuccess("contractorOps.toast.saved");
  return row;
}

export async function updateProgressSummary(
  id: string,
  payload: { title?: string; blocks?: SummaryBlock[] },
) {
  const row = await api.patch<ProgressSummary>(`/api/progress-summaries/${id}/update_summary/`, {
    ...payload,
    ...(payload.blocks ? { blocks: storedBlocks(payload.blocks) } : {}),
  });
  toastSuccess("contractorOps.toast.saved");
  return row;
}

export async function deleteProgressSummary(id: string) {
  await api.delete(`/api/progress-summaries/${id}/delete_summary/`);
  toastSuccess("draftRecords.deleted");
}

/** JB25: 【确认归档】 - locked from now on, and only then printed and sent. */
export async function archiveProgressSummary(id: string) {
  const row = await api.post<ProgressSummary>(`/api/progress-summaries/${id}/archive_summary/`, {});
  toastSuccess("draftRecords.archivedToast");
  return row;
}

/** The summary as a PDF, its blocks in order (H16): 预览 · 打印 · 导出 · 发送. */
export const progressSummaryPdfFile = (id: string, lang: string, title: string, preview = false) =>
  fetchAsFile(`/api/progress-summaries/${id}/get_summary_pdf/`, {
    method: "GET",
    // JB25: not yet archived, it is fetched to preview only.
    query: { lang, ...(preview ? { preview: "1" } : {}) },
    fallbackFilename: `${(title || "progress-summary").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`,
  });
