import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  MaterialCatalogue,
  MaterialRequest,
  MaterialRequestDraft,
  MaterialRequestReviewerOption,
  MaterialRequestTotal,
  MaterialRequestTotalColumn,
  MaterialRequestTotalRecord,
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

/** The records behind one figure of 申请累计 (JB243), newest first. */
export const getMaterialRequestTotalRecords = (
  row: Pick<MaterialRequestTotal, "project" | "material_name" | "specification" | "unit">,
  column: MaterialRequestTotalColumn,
  supplier?: string,
) =>
  api.get<MaterialRequestTotalRecord[]>("/api/material-requests/get_total_records/", {
    project: row.project,
    material_name: row.material_name,
    specification: row.specification,
    unit: row.unit,
    column,
    ...(supplier ? { supplier } : {}),
  });

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
 * Approve, or return - which ends the request (C05). Approving a material
 * request may name its suppliers - none, one or several - and the owner's
 * named manufacturer (JB292, 客户 11-27f: both optional, 「即使没有选择供应商，
 * 「批准」按钮也必须正常显示，并允许完成审批」): `purchase` carries them, an
 * empty list included. Returning needs neither.
 */
export async function reviewMaterialRequest(
  id: string,
  decision: "APPROVED" | "RETURNED",
  note = "",
  purchase?: { suppliers: string[]; manufacturer: string },
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
/**
 * The project manager's answer to a site staff's request (I12, ID29):
 * 「转呈总部」 to a head-office approver, same request and number - or return it.
 */
export async function managerDecideMaterialRequest(
  id: string,
  decision: "FORWARD" | "RETURNED",
  { assignedReviewer = "", note = "" }: { assignedReviewer?: string; note?: string } = {},
) {
  const row = await api.post<MaterialRequest>(`/api/material-requests/${id}/manager_decide/`, {
    decision,
    note,
    ...(decision === "FORWARD" ? { assigned_reviewer: assignedReviewer } : {}),
  });
  toastSuccess(decision === "FORWARD" ? "materialRequest.toast.forwarded" : "materialRequest.toast.returned");
  return row;
}

/** 「开始处理」 (JB231): the project manager marks an approved request 处理中. */
export async function startMaterialRequestExecution(id: string) {
  const row = await api.post<MaterialRequest>(`/api/material-requests/${id}/start_execution/`, {});
  toastSuccess("materialRequest.execution.IN_PROGRESS");
  return row;
}

/**
 * 「确认完成」 (JB231): who and when are recorded, the 24-hour reminders stop
 * and the request's conversation closes. The note is optional.
 */
export async function confirmMaterialRequestCompletion(id: string, note = "") {
  const row = await api.post<MaterialRequest>(`/api/material-requests/${id}/confirm_completion/`, { note });
  toastSuccess("materialRequest.execution.COMPLETED");
  return row;
}

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

/**
 * The project's materials, their specifications and units, for the form (I19).
 * With a delivery (JB275): each with its unit price on that delivery's day.
 */
export const getMaterialCatalogue = (project: string, receipt?: string) =>
  api.get<MaterialCatalogue>("/api/material-requests/get_material_catalogue/", {
    project,
    ...(receipt ? { receipt } : {}),
  });

/** 申请累计 (H16, HD13): the rows the list shows, as Excel or PDF. */
export function exportMaterialRequestTotals(request: ExportRequest): Promise<void> {
  return download("/api/material-requests/export_totals/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `material-request-totals.${request.format}`,
  });
}

/** JB25: change a request waiting for its decision - overwritten, no old version. */
export async function updateMaterialRequest(id: string, body: FormData | Record<string, unknown>) {
  const row = await api.post<MaterialRequest>(`/api/material-requests/${id}/update_request/`, body);
  toastSuccess("contractorOps.toast.saved");
  return row;
}

/** JB25: the trash can on a request waiting for its decision - PIN, total. */
export async function deleteMaterialRequest(id: string) {
  await api.delete(`/api/material-requests/${id}/delete_request/`);
  toastSuccess("draftRecords.deleted");
}
