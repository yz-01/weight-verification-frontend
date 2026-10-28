/**
 * 人员名单 (I20): the office's roster, its 进出场记录, and the location link.
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  BatchDetail,
  BatchExcelResult,
  BatchPhotoResult,
  BatchRowsPoll,
  BatchSaveResult,
  BatchSyncResult,
  BatchSyncRow,
  CaptureLink,
  CompanyOption,
  IssuedWorkerLink,
  SiteWorker,
  SiteWorkerDetail,
  SiteWorkerList,
  SiteWorkerPayload,
  SiteWorkerBatch,
  SiteWorkerVisit,
} from "@/interfaces/site-workers";
import { exportBody, exportQuery, type ExportRequest } from "@/services/contractor.service";
import { api, download, toastSuccess } from "@/services/api-client";

export function getSiteWorkers(query: ListQuery): Promise<SiteWorkerList> {
  return api.get<SiteWorkerList>("/api/site-workers/get_workers/", query);
}

export function getSiteWorker(id: string): Promise<SiteWorkerDetail> {
  return api.get<SiteWorkerDetail>(`/api/site-workers/${id}/get_worker/`);
}

/** 「所属公司」: the roster's own companies (`used`), or the company list. */
export async function getWorkerCompanyOptions(query: ListQuery): Promise<CompanyOption[]> {
  const data = await api.get<{ results: CompanyOption[] }>(
    "/api/site-workers/get_company_options/",
    query,
  );
  return data.results;
}

export async function createSiteWorker(payload: SiteWorkerPayload): Promise<SiteWorker> {
  const worker = await api.post<SiteWorker>("/api/site-workers/create_worker/", payload);
  toastSuccess("siteWorkers.toast.created");
  return worker;
}

export async function updateSiteWorker(id: string, payload: SiteWorkerPayload): Promise<SiteWorker> {
  const worker = await api.post<SiteWorker>(`/api/site-workers/${id}/update_worker/`, payload);
  toastSuccess("siteWorkers.toast.updated");
  return worker;
}

export async function deactivateSiteWorker(id: string): Promise<SiteWorker> {
  const worker = await api.post<SiteWorker>(`/api/site-workers/${id}/deactivate_worker/`, {});
  toastSuccess("siteWorkers.toast.deactivated");
  return worker;
}

export async function reactivateSiteWorker(id: string): Promise<SiteWorker> {
  const worker = await api.post<SiteWorker>(`/api/site-workers/${id}/reactivate_worker/`, {});
  toastSuccess("siteWorkers.toast.reactivated");
  return worker;
}

/** A new link; the old one stops working. The raw link is only in this answer. */
export function issueWorkerLink(id: string): Promise<IssuedWorkerLink> {
  return api.post<IssuedWorkerLink>(`/api/site-workers/${id}/issue_link/`, {});
}

export function exportSiteWorkers(request: ExportRequest): Promise<void> {
  return download("/api/site-workers/export_workers/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `site-workers.${request.format}`,
  });
}

export function getSiteWorkerVisits(query: ListQuery): Promise<Paginated<SiteWorkerVisit>> {
  return api.list<SiteWorkerVisit>("/api/site-worker-visits/get_visits/", query);
}

export function exportSiteWorkerVisits(request: ExportRequest): Promise<void> {
  return download("/api/site-worker-visits/export_visits/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `site-worker-visits.${request.format}`,
  });
}

/** 修改资料 → 护照照片 (JB61-2): a photo or PDF, replacing the kept one. */
export function uploadPassportPhoto(id: string, file: File): Promise<SiteWorker> {
  const body = new FormData();
  body.append("file", file);
  return api.post<SiteWorker>(`/api/site-workers/${id}/upload_passport_photo/`, body);
}

// --- 批量新增人员 (JB61-1) ---------------------------------------------------

const batches = "/api/site-worker-batches";

export async function getOpenBatches(project?: string): Promise<SiteWorkerBatch[]> {
  const data = await api.get<{ results: SiteWorkerBatch[] }>(
    `${batches}/get_batches/`,
    project ? { project } : {},
  );
  return data.results;
}

export function createBatch(payload: {
  project: string;
  supplier: string | null;
  company_note: string;
}): Promise<SiteWorkerBatch> {
  return api.post<SiteWorkerBatch>(`${batches}/create_batch/`, payload);
}

export function updateBatch(
  id: string,
  payload: { supplier: string | null; company_note: string },
): Promise<SiteWorkerBatch> {
  return api.post<SiteWorkerBatch>(`${batches}/${id}/update_batch/`, payload);
}

export function getBatch(id: string): Promise<BatchDetail> {
  return api.get<BatchDetail>(`${batches}/${id}/get_batch/`);
}

/** Polled: rows phones, uploads and imports added since `since`, and every row's problems. */
export function getBatchRows(id: string, since: string): Promise<BatchRowsPoll> {
  return api.get<BatchRowsPoll>(`${batches}/${id}/get_rows/`, { since }, { silent: true });
}

export function syncBatchRows(
  id: string,
  rows: BatchSyncRow[],
  deleted: string[],
): Promise<BatchSyncResult> {
  return api.post<BatchSyncResult>(`${batches}/${id}/save_rows/`, { rows, deleted });
}

/** Silent: the page lists each file that did not go in, and why. */
export function uploadBatchPhoto(id: string, file: File): Promise<BatchPhotoResult> {
  const body = new FormData();
  body.append("file", file);
  return api.post<BatchPhotoResult>(`${batches}/${id}/upload_photo/`, body, { silent: true });
}

export function importBatchExcel(id: string, file: File): Promise<BatchExcelResult> {
  const body = new FormData();
  body.append("file", file);
  return api.post<BatchExcelResult>(`${batches}/${id}/import_excel/`, body);
}

export function downloadBatchTemplate(lang: string): Promise<void> {
  return download(`${batches}/get_excel_template/`, {
    method: "GET",
    query: { lang },
    fallbackFilename: "site-workers-template.xlsx",
  });
}

export function getCaptureLink(id: string): Promise<CaptureLink> {
  return api.get<CaptureLink>(`${batches}/${id}/get_capture_link/`);
}

export function stopCapture(id: string): Promise<{ stopped: boolean }> {
  return api.post<{ stopped: boolean }>(`${batches}/${id}/stop_capture/`, {});
}

/** 「全部保存」, one chunk; call again with `last` until `done`. */
export function saveBatchChunk(id: string, after: number): Promise<BatchSaveResult> {
  return api.post<BatchSaveResult>(`${batches}/${id}/save_batch/`, { after });
}

export function closeBatch(id: string): Promise<SiteWorkerBatch> {
  return api.post<SiteWorkerBatch>(`${batches}/${id}/close_batch/`, {});
}
