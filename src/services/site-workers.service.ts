/**
 * 人员名单 (I20): the office's roster, its 进出场记录, and the location link.
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CompanyOption,
  IssuedWorkerLink,
  SiteWorker,
  SiteWorkerDetail,
  SiteWorkerList,
  SiteWorkerPayload,
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
