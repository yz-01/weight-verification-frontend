import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  MaterialCatalogue,
  MaterialRequest,
  MaterialRequestDraft,
  MaterialRequestReviewerOption,
  MaterialRequestTotal,
  RequestFormStyle,
  RequestType,
} from "@/interfaces/material-request";
import { api, download, fetchAsFile, toastSuccess } from "@/services/api-client";
import { exportBody, exportQuery, type ExportRequest } from "@/services/contractor.service";

/** MR / Other Request (C01–C07). Endpoints in `contractor_ops/material_requests.py`. */
export const getMaterialRequests = (query: ListQuery = {}): Promise<Paginated<MaterialRequest>> =>
  api.list<MaterialRequest>("/api/material-requests/get_requests/", query);

export const getMaterialRequest = (id: string) =>
  api.get<MaterialRequest>(`/api/material-requests/${id}/get_request/`);

/** Approved and pending quantities per material + specification + unit (C04). */
export const getMaterialRequestTotals = (query: ListQuery = {}) =>
  api.get<MaterialRequestTotal[]>("/api/material-requests/get_summary/", query);

export async function createMaterialRequest(draft: MaterialRequestDraft) {
  const data = new FormData();
  for (const [key, value] of Object.entries(draft)) {
    if (key === "attachments") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  draft.attachments.forEach((file) => data.append("attachments", file));
  const row = await api.post<MaterialRequest>("/api/material-requests/create_request/", data);
  toastSuccess("materialRequest.toast.submitted");
  return row;
}

/**
 * Approve, or return - which ends the request (C05). Approve or return. Approving a material request settles who it is bought
 * from and whose make (2026-10 D1, D2): `purchase` carries both, and the
 * server refuses an approval without them. Returning needs neither.
 */
export async function reviewMaterialRequest(
  id: string,
  decision: "APPROVED" | "RETURNED",
  note = "",
  purchase?: { supplier: string; manufacturer: string },
) {
  const row = await api.post<MaterialRequest>(`/api/material-requests/${id}/review_request/`, {
    decision,
    note,
    ...(decision === "APPROVED" && purchase ? purchase : {}),
  });
  toastSuccess(decision === "APPROVED" ? "materialRequest.toast.approved" : "materialRequest.toast.returned");
  return row;
}

/** 「提交给」 (D2): who may approve a request on this project, never the reader. */
export const getMaterialRequestReviewerOptions = (project: string) =>
  api.get<MaterialRequestReviewerOption[]>("/api/material-requests/reviewer_options/", { project });

/** 「改派给我」 (D2): another approver takes a waiting request over; the history keeps it. */
export async function reassignMaterialRequestToMe(id: string) {
  const row = await api.post<MaterialRequest>(`/api/material-requests/${id}/reassign/`, {});
  toastSuccess("materialRequest.toast.reassigned");
  return row;
}

/**
 * The formal form (C06) as `<Request No>.pdf`, fetched once for 预览 · 打印 ·
 * 导出 · 发送 alike (PDF 统一操作规则). `download=1` only changes how the
 * server labels the response, not the file.
 */
export const materialRequestFormFile = (id: string, lang: string, requestNo: string) =>
  fetchAsFile(`/api/material-requests/${id}/get_request_pdf/`, {
    method: "GET",
    query: { lang, download: "1" },
    fallbackFilename: `${requestNo}.pdf`,
  });

export function exportMaterialRequests(request: ExportRequest): Promise<void> {
  return download("/api/material-requests/export_requests/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `material-requests.${request.format}`,
  });
}

/** The project's request types (I16); `all` adds the switched-off ones for the dialog. */
export const getRequestTypes = (project: string, all = false) =>
  api.get<RequestType[]>("/api/material-requests/get_request_types/", {
    ...(project ? { project } : {}),
    ...(all ? { all: "true" } : {}),
  });

export async function createRequestType(payload: {
  project: string;
  name: string;
  form_style?: RequestFormStyle;
  description?: string;
}) {
  const row = await api.post<RequestType>("/api/material-requests/create_request_type/", payload);
  toastSuccess("materialRequest.types.toast.saved");
  return row;
}

export async function updateRequestType(
  id: string,
  payload: Partial<Pick<RequestType, "name" | "form_style" | "description" | "is_active" | "sort_order">>,
) {
  const row = await api.post<RequestType>(`/api/material-requests/${id}/update_request_type/`, payload);
  toastSuccess("materialRequest.types.toast.saved");
  return row;
}

export async function deleteRequestType(id: string) {
  await api.delete(`/api/material-requests/${id}/delete_request_type/`);
  toastSuccess("materialRequest.types.toast.removed");
}

/** The project's materials, their specifications and units, for the form (I19). */
export const getMaterialCatalogue = (project: string) =>
  api.get<MaterialCatalogue>("/api/material-requests/get_material_catalogue/", { project });

/** 申请累计 (H16, HD13): the rows the list shows, as Excel or PDF. */
export function exportMaterialRequestTotals(request: ExportRequest): Promise<void> {
  return download("/api/material-requests/export_totals/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `material-request-totals.${request.format}`,
  });
}
