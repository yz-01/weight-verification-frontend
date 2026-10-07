/**
 * 现场照片, 日报告 and 项目进度摘要 - the progress page's tabs (2026-10 B17).
 */
import type { ListQuery } from "@/interfaces/api";
import type {
  DailyReport,
  DailyReportPayload,
  ProgressPhoto,
  ProgressSummary,
  SummaryBlock,
} from "@/interfaces/progress-reports";
import { api, toastSuccess } from "@/services/api-client";

/** 现场照片: progress photographs by project, 施工分类 and day. */
export const getProgressPhotos = (query: ListQuery = {}) =>
  api.list<ProgressPhoto>("/api/site-progress/get_photos/", query);

export const getDailyReports = (query: ListQuery = {}) =>
  api.list<DailyReport>("/api/daily-reports/get_reports/", query);

export const getDailyReport = (id: string) =>
  api.get<DailyReport>(`/api/daily-reports/${id}/get_report/`);

export async function createDailyReport(payload: DailyReportPayload) {
  const row = await api.post<DailyReport>("/api/daily-reports/create_report/", payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
}

export async function updateDailyReport(
  id: string,
  payload: Partial<Omit<DailyReportPayload, "project">>,
) {
  const row = await api.patch<DailyReport>(`/api/daily-reports/${id}/update_report/`, payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
}

export async function deleteDailyReport(id: string) {
  await api.delete(`/api/daily-reports/${id}/delete_report/`);
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
  toastSuccess("contractorOps.toast.removed");
}
