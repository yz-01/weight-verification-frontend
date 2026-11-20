/** 施工准证 (Permit to Work): apply, decide, find and open the files. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  Permit,
  PermitApplication,
  PermitFile,
  PermitPerson,
  PermitWorkFormInput,
  PermitWorkType,
} from "@/interfaces/permit";
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

/**
 * 签名批准. ``seenFormAt``: the save time of the e-permit the signer's window
 * shows (``null``: none) - one changed since is refused, not signed (JB216
 * audit F5).
 */
export async function approvePermit(
  id: string,
  signature: File,
  note: string,
  seenFormAt: string | null = null,
): Promise<Permit> {
  const body = new FormData();
  body.append("signature", signature);
  body.append("note", note);
  body.append("seen_form_at", seenFormAt ?? "");
  const permit = await api.post<Permit>(`${BASE}/${id}/approve_permit/`, body);
  toastSuccess("permits.toast.approved", { reference: permit.incident_no });
  return permit;
}

export async function returnPermit(id: string, reason: string): Promise<Permit> {
  const permit = await api.post<Permit>(`${BASE}/${id}/return_permit/`, { reason });
  toastSuccess("permits.toast.returned", { reference: permit.incident_no });
  return permit;
}

/** 「填写电子准证」 → 【保存】 (JB216): the approver's e-permit, on the same record. */
export async function saveWorkForm(id: string, form: PermitWorkFormInput): Promise<Permit> {
  const permit = await api.post<Permit>(`${BASE}/${id}/save_work_form/`, form);
  toastSuccess("permits.toast.formSaved", {
    reference: permit.work_form?.permit_no || permit.incident_no,
  });
  return permit;
}

/* 施工准证 · 施工类别 (JB216): the company's own list, kept in 分类管理. */

const WORK_TYPES = "/api/permit-work-types";

/** One cached list for the e-permit's drop-down and 分类管理. */
export const PERMIT_WORK_TYPES_KEY = ["permit-work-types"] as const;

export function getPermitWorkTypes(): Promise<PermitWorkType[]> {
  return api.get<PermitWorkType[]>(`${WORK_TYPES}/get_work_types/`);
}

export async function createPermitWorkType(name: string): Promise<PermitWorkType> {
  const row = await api.post<PermitWorkType>(`${WORK_TYPES}/create_work_type/`, { name });
  toastSuccess("permits.workTypes.toast.added", { name: row.name });
  return row;
}

export async function updatePermitWorkType(id: string, name: string): Promise<PermitWorkType> {
  const row = await api.post<PermitWorkType>(`${WORK_TYPES}/${id}/update_work_type/`, { name });
  toastSuccess("permits.workTypes.toast.renamed", { name: row.name });
  return row;
}

export async function deletePermitWorkType(id: string, name: string): Promise<void> {
  await api.post(`${WORK_TYPES}/${id}/delete_work_type/`, {});
  toastSuccess("permits.workTypes.toast.removed", { name });
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
