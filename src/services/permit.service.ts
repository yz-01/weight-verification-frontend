/** 施工准证 (Permit to Work): apply, decide, find and open the files. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { Permit, PermitApplication, PermitFile, PermitPerson } from "@/interfaces/permit";
import {
  exportBody,
  exportQuery,
  type ExportRequest,
} from "@/services/contractor.service";
import { api, download, fetchObjectUrl, toastSuccess } from "@/services/api-client";

const BASE = "/api/permits";

export function getPermits(query: ListQuery): Promise<Paginated<Permit>> {
  return api.list<Permit>(`${BASE}/get_permits/`, query);
}

export function getPermit(id: string): Promise<Permit> {
  return api.get<Permit>(`${BASE}/${id}/get_permit/`);
}

/** The safety managers a permit on this project may be sent to. */
export function getPermitApprovers(project: string): Promise<PermitPerson[]> {
  return api.get<PermitPerson[]>(`${BASE}/approver_options/`, { project });
}

/** Everyone who applied for a permit the reader can see (the filter). */
export function getPermitApplicants(): Promise<PermitPerson[]> {
  return api.get<PermitPerson[]>(`${BASE}/applicant_options/`);
}

export async function createPermit(application: PermitApplication): Promise<Permit> {
  const body = new FormData();
  body.append("project", application.project);
  body.append("approver", application.approver);
  body.append("note", application.note);
  if (application.client_event_id) body.append("client_event_id", application.client_event_id);
  for (const file of application.files) body.append("files", file);
  const permit = await api.post<Permit>(`${BASE}/create_permit/`, body);
  toastSuccess("permits.toast.submitted", { reference: permit.incident_no });
  return permit;
}

export async function resubmitPermit(id: string, files: File[], note: string): Promise<Permit> {
  const body = new FormData();
  body.append("note", note);
  for (const file of files) body.append("files", file);
  const permit = await api.post<Permit>(`${BASE}/${id}/resubmit_permit/`, body);
  toastSuccess("permits.toast.resubmitted", { reference: permit.incident_no });
  return permit;
}

export async function approvePermit(id: string, signature: File, note: string): Promise<Permit> {
  const body = new FormData();
  body.append("signature", signature);
  body.append("note", note);
  const permit = await api.post<Permit>(`${BASE}/${id}/approve_permit/`, body);
  toastSuccess("permits.toast.approved", { reference: permit.incident_no });
  return permit;
}

export async function returnPermit(id: string, reason: string): Promise<Permit> {
  const permit = await api.post<Permit>(`${BASE}/${id}/return_permit/`, { reason });
  toastSuccess("permits.toast.returned", { reference: permit.incident_no });
  return permit;
}

function fileQuery(file: PermitFile, inline: boolean) {
  return { file: file.id, ...(inline ? { inline: "1" } : {}) };
}

/** The file, fetched with the session, as an object URL for the preview. */
export function permitFileObjectUrl(permitId: string, file: PermitFile): Promise<string> {
  return fetchObjectUrl(`${BASE}/${permitId}/download_file/`, { query: fileQuery(file, true) });
}

/** The file itself, for printing: the same bytes the preview shows. */
export async function permitFileBlob(permitId: string, file: PermitFile): Promise<File> {
  const url = await permitFileObjectUrl(permitId, file);
  try {
    const blob = await (await fetch(url)).blob();
    return new File([blob], file.original_name, { type: blob.type || file.content_type });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadPermitFile(permitId: string, file: PermitFile): Promise<void> {
  return download(`${BASE}/${permitId}/download_file/`, {
    query: fileQuery(file, false),
    fallbackFilename: file.original_name,
  });
}

export function exportPermits(request: ExportRequest): Promise<void> {
  return download(`${BASE}/export_permits/`, {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `permits.${request.format}`,
  });
}
