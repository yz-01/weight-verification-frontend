/** The contractor console's API surface.

One module for the whole console because its four resources are one workflow:
a project holds suppliers' dockets, a docket opens a receipt, and waste leaves
against the same project. Splitting them would mean four files that are only
ever imported together.
*/

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { UserRow } from "@/interfaces/auth";
import type {
  DispatchSummary,
  MaterialReceipt,
  MaterialReceiptDetail,
  MaterialReceiptPayload,
  Project,
  ProjectAssignment,
  ProjectPayload,
  ProjectStatistics,
  ProjectStatisticsPeriod,
  ReceiptSummary,
  RecyclerOption,
  Supplier,
  SupplierPayload,
  SupplierQRCode,
  DeliveryNoteOCRResult,
  DeliveryNote,
  DeliveryNotePublic,
  WasteDispatch,
  WasteDispatchDetail,
  WasteDispatchPayload,
} from "@/interfaces/contractor";
import type { QRCodeIssue } from "@/interfaces/qrcode";
import { api, download, toastSuccess } from "@/services/api-client";

/** One column in an export, worded by the caller. */
export interface ExportColumn {
  key: string;
  label: string;
  /** Translations for the codes inside the column, e.g. `TONNE` → `吨`. */
  values?: Record<string, string>;
}

export type ExportFormat = "xlsx" | "pdf";

export interface ExportRequest {
  format: ExportFormat;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  emptyLabel?: string;
  /** The list query on screen, so the file matches what was being looked at. */
  query: ListQuery;
}

function exportBody(request: ExportRequest) {
  return {
    format: request.format,
    title: request.title,
    subtitle: request.subtitle ?? "",
    empty_label: request.emptyLabel ?? "",
    columns: request.columns,
  };
}

/** Page and page size are meaningless in an export: the file is the whole set. */
function exportQuery({ query }: ExportRequest): ListQuery {
  const { page, page_size, ...rest } = query;
  void page;
  void page_size;
  return rest;
}

export function getProjects(query: ListQuery): Promise<Paginated<Project>> {
  return api.list<Project>("/api/projects/get_projects/", query);
}

export function getProject(id: string): Promise<Project> {
  return api.get<Project>(`/api/projects/${id}/get_project/`);
}

export function getProjectStatistics(
  id: string,
  period: ProjectStatisticsPeriod,
): Promise<ProjectStatistics> {
  return api.get<ProjectStatistics>(`/api/projects/${id}/get_statistics/`, {
    period,
  });
}

export async function createProject(payload: ProjectPayload): Promise<Project> {
  const project = await api.post<Project>(
    "/api/projects/create_project/",
    payload,
  );
  toastSuccess("projects.toast.created");
  return project;
}

export async function updateProject(
  id: string,
  payload: Partial<ProjectPayload>,
): Promise<Project> {
  const project = await api.patch<Project>(
    `/api/projects/${id}/update_project/`,
    payload,
  );
  toastSuccess("projects.toast.updated");
  return project;
}

export async function suspendProject(id: string): Promise<Project> {
  const project = await api.delete<Project>(`/api/projects/${id}/delete_project/`);
  toastSuccess("projects.toast.suspended");
  return project;
}

export function getProjectAssignments(
  id: string,
): Promise<{ results: ProjectAssignment[]; count: number }> {
  return api.get<{ results: ProjectAssignment[]; count: number }>(
    `/api/projects/${id}/get_assignments/`,
  );
}

export async function archiveProject(id: string): Promise<Project> {
  const project = await api.post<Project>(
    `/api/projects/${id}/archive_project/`,
    { confirm: true },
  );
  toastSuccess("projects.toast.archived");
  return project;
}

export function getProjectQr(id: string): Promise<QRCodeIssue | null> {
  return api.get<QRCodeIssue | null>(`/api/projects/${id}/get_project_qr/`);
}

export async function setProjectQrStatus(
  id: string,
  status: "ACTIVE" | "DISABLED",
  note = "",
): Promise<QRCodeIssue> {
  const code = await api.post<QRCodeIssue>(
    `/api/projects/${id}/set_project_qr_status/`,
    { status, note },
  );
  toastSuccess("projects.toast.qrStatusUpdated");
  return code;
}

export async function regenerateProjectQr(
  id: string,
  note: string,
): Promise<QRCodeIssue> {
  const code = await api.post<QRCodeIssue>(
    `/api/projects/${id}/regenerate_project_qr/`,
    { confirm: true, note },
  );
  toastSuccess("projects.toast.qrRegenerated");
  return code;
}

export function exportProjects(request: ExportRequest): Promise<void> {
  return download("/api/projects/export_projects/", {
    method: "POST",
    body: exportBody(request),
    query: exportQuery(request),
    fallbackFilename: `projects.${request.format}`,
  });
}

export function getAssignableProjectUsers(
  id: string,
): Promise<Paginated<UserRow>> {
  return api.list<UserRow>(
    `/api/projects/${id}/get_assignable_users/`,
    { page_size: 100, sort_by: "full_name" },
  );
}

export async function assignUserToProject(
  id: string,
  userId: string,
): Promise<ProjectAssignment> {
  const assignment = await api.post<ProjectAssignment>(
    `/api/projects/${id}/assign_user/`,
    { user: userId },
  );
  toastSuccess("projects.toast.assigned");
  return assignment;
}

export async function unassignUserFromProject(
  id: string,
  userId: string,
): Promise<void> {
  await api.post(`/api/projects/${id}/unassign_user/`, { user: userId });
  toastSuccess("projects.toast.unassigned");
}

export function getSuppliers(query: ListQuery): Promise<Paginated<Supplier>> {
  return api.list<Supplier>("/api/suppliers/get_suppliers/", query);
}

export function getSupplier(id: string): Promise<Supplier> {
  return api.get<Supplier>(`/api/suppliers/${id}/get_supplier/`);
}

export async function createSupplier(
  payload: SupplierPayload,
): Promise<Supplier> {
  const supplier = await api.post<Supplier>(
    "/api/suppliers/create_supplier/",
    payload,
  );
  toastSuccess("suppliers.toast.created");
  return supplier;
}

export async function updateSupplier(
  id: string,
  payload: Partial<SupplierPayload>,
): Promise<Supplier> {
  const supplier = await api.patch<Supplier>(
    `/api/suppliers/${id}/update_supplier/`,
    payload,
  );
  toastSuccess("suppliers.toast.updated");
  return supplier;
}

export async function deleteSupplier(id: string): Promise<void> {
  await api.delete(`/api/suppliers/${id}/delete_supplier/`);
  toastSuccess("suppliers.toast.removed");
}

export function getQRCodes(query: ListQuery): Promise<Paginated<SupplierQRCode>> {
  return api.list<SupplierQRCode>("/api/supplier-qr-codes/get_qr_codes/", query);
}

export function getDeliveryNotes(query: ListQuery = {}): Promise<Paginated<DeliveryNote>> {
  return api.list<DeliveryNote>("/api/delivery-notes/get_notes/", query);
}

export function getDeliveryNote(id: string): Promise<DeliveryNote> {
  return api.get<DeliveryNote>(`/api/delivery-notes/${id}/get_note/`);
}

export async function issueDeliveryNote(payload: {
  project: string;
  supplier: string;
  vehicle_plate: string;
  driver_name: string;
  material_name: string;
  expected_quantity: string;
  unit: string;
  expected_delivery_at: string;
  notes?: string;
}): Promise<DeliveryNote> {
  const note = await api.post<DeliveryNote>("/api/delivery-notes/issue_note/", payload, { silent: true });
  toastSuccess("qrCodes.toast.created");
  return note;
}

export async function closeDeliveryNote(id: string): Promise<DeliveryNote> {
  const note = await api.post<DeliveryNote>(`/api/delivery-notes/${id}/close_note/`, {});
  toastSuccess("qrCodes.toast.closed");
  return note;
}

export async function cancelDeliveryNote(id: string, reason: string): Promise<DeliveryNote> {
  return api.post<DeliveryNote>(`/api/delivery-notes/${id}/cancel_note/`, { reason });
}

export async function voidDeliveryNote(id: string, reason: string): Promise<DeliveryNote> {
  return api.post<DeliveryNote>(`/api/delivery-notes/${id}/void_note/`, { reason });
}

export function getPublicDeliveryNote(token: string): Promise<DeliveryNotePublic> {
  return api.get<DeliveryNotePublic>(`/api/delivery-note-task/${encodeURIComponent(token)}/`, undefined, { auth: false, silent: true });
}

export function recordPublicDeliveryArrival(token: string, location: { latitude: string; longitude: string; location_accuracy_m?: string }): Promise<DeliveryNotePublic> {
  return api.post<DeliveryNotePublic>(`/api/delivery-note-task/${encodeURIComponent(token)}/`, { operation: "arrive", ...location }, { auth: false, silent: true });
}

export async function uploadPublicDeliveryEvidence(token: string, payload: { kind: string; image: File; latitude: string; longitude: string; device_id?: string; client_event_id: string; caption?: string }): Promise<DeliveryNotePublic> {
  const data = new FormData();
  data.append("operation", "add_evidence");
  for (const [key, value] of Object.entries(payload)) {
    if (key === "image" || value === undefined || value === "") continue;
    data.append(key, String(value));
  }
  data.append("image", payload.image);
  return api.post<DeliveryNotePublic>(`/api/delivery-note-task/${encodeURIComponent(token)}/`, data, { auth: false, silent: true });
}

export async function completePublicDeliveryNote(token: string, payload: {
  decision: "RECEIVED" | "REJECTED";
  actual_quantity: string;
  receiver_name: string;
  receiver_signature: File;
  rejection_reason?: string;
  note?: string;
  latitude: string;
  longitude: string;
  location_accuracy_m?: string;
}): Promise<DeliveryNotePublic> {
  const data = new FormData();
  data.append("operation", "complete");
  for (const [key, value] of Object.entries(payload)) {
    if (key === "receiver_signature" || value === undefined || value === "") continue;
    data.append(key, String(value));
  }
  data.append("receiver_signature", payload.receiver_signature);
  return api.post<DeliveryNotePublic>(`/api/delivery-note-task/${encodeURIComponent(token)}/`, data, { auth: false, silent: true });
}

export async function createQRCode(payload: {
  project: string;
  supplier: string;
}): Promise<SupplierQRCode> {
  const code = await api.post<SupplierQRCode>(
    "/api/supplier-qr-codes/create_qr_code/",
    payload,
  );
  toastSuccess("qrCodes.toast.created");
  return code;
}

/**
 * Stop a printed docket working.
 *
 * Revoked, not deleted: receipts already taken against it keep their
 * reference, so an auditor can still see which docket produced which delivery.
 */
export async function revokeQRCode(id: string, reason: string): Promise<void> {
  await api.post(`/api/supplier-qr-codes/${id}/revoke_qr_code/`, { reason });
  toastSuccess("qrCodes.toast.revoked");
}

export function scanQRCode(token: string): Promise<SupplierQRCode> {
  return api.post<SupplierQRCode>("/api/supplier-qr-codes/scan_qr_code/", {
    token,
  });
}

export function getReceipts(
  query: ListQuery,
): Promise<Paginated<MaterialReceipt>> {
  return api.list<MaterialReceipt>("/api/receipts/get_receipts/", query);
}

export function getReceipt(id: string): Promise<MaterialReceiptDetail> {
  return api.get<MaterialReceiptDetail>(`/api/receipts/${id}/get_receipt/`);
}

/**
 * File a delivery.
 *
 * The payload deliberately carries no timestamp or operator. The backend
 * stamps both, so a device cannot file yesterday's delivery as today's.
 */
export async function createReceipt(
  payload: MaterialReceiptPayload,
): Promise<MaterialReceiptDetail> {
  const receipt = await api.post<MaterialReceiptDetail>(
    "/api/receipts/create_receipt/",
    payload,
  );
  toastSuccess("receipts.toast.created");
  return receipt;
}

export async function regenerateSupplierQr(id: string): Promise<Supplier> {
  const supplier = await api.post<Supplier>(
    `/api/suppliers/${id}/regenerate_supplier_qr/`,
    {},
  );
  toastSuccess("suppliers.toast.qrRegenerated");
  return supplier;
}

export async function setSupplierQrStatus(
  id: string,
  isActive: boolean,
): Promise<Supplier> {
  const supplier = await api.post<Supplier>(
    `/api/suppliers/${id}/set_supplier_qr_status/`,
    { is_active: isActive },
  );
  toastSuccess(isActive ? "suppliers.toast.qrEnabled" : "suppliers.toast.qrDisabled");
  return supplier;
}

export function exportSuppliers(request: ExportRequest): Promise<void> {
  return download("/api/suppliers/export_suppliers/", {
    method: "POST",
    body: exportBody(request),
    query: exportQuery(request),
    fallbackFilename: `suppliers.${request.format}`,
  });
}

export function readDeliveryNote(
  project: string,
  image: File,
): Promise<DeliveryNoteOCRResult> {
  const data = new FormData();
  data.append("project", project);
  data.append("image", image);
  return api.post<DeliveryNoteOCRResult>(
    "/api/receipts/ocr_delivery_note/",
    data,
    { silent: true },
  );
}

export async function createReceiptWithEvidence(payload: {
  receipt: MaterialReceiptPayload;
  signature: File;
  supplierSignature: File;
  deliveryNotePhoto?: File;
  sitePhotos: File[];
  deviceId: string;
}): Promise<MaterialReceiptDetail> {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload.receipt)) {
    if (value !== undefined && value !== null && value !== "") {
      data.append(key, String(value));
    }
  }
  data.append("signature", payload.signature);
  data.append("supplier_signature", payload.supplierSignature);
  const photos = [
    ...payload.sitePhotos.map((file, index) => ({
      file,
      kind: index === 0 ? "VEHICLE" : index === 1 ? "UNLOADING" : "OTHER",
      caption:
        index === 0
          ? "Arriving vehicle"
          : index === 1
            ? "Unloading process"
            : index === 2
              ? "Empty vehicle after unloading"
              : "Other site photo",
    })),
    ...(payload.deliveryNotePhoto
      ? [{
          file: payload.deliveryNotePhoto,
          kind: "DELIVERY_NOTE",
          caption: "Delivery Order",
        }]
      : []),
  ];
  for (const [index, photo] of photos.entries()) {
    data.append("photos", photo.file);
    data.append(`photo_kind_${index}`, photo.kind);
    data.append(`photo_caption_${index}`, photo.caption);
  }
  data.append("device_id", payload.deviceId);

  const receipt = await api.post<MaterialReceiptDetail>(
    "/api/receipts/create_receipt/",
    data,
    { silent: true },
  );

  toastSuccess("receipts.toast.created");
  return receipt;
}

export async function updateReceipt(
  id: string,
  payload: Partial<MaterialReceiptPayload>,
): Promise<MaterialReceiptDetail> {
  const receipt = await api.patch<MaterialReceiptDetail>(
    `/api/receipts/${id}/update_receipt/`,
    payload,
  );
  toastSuccess("receipts.toast.updated");
  return receipt;
}

export async function deleteReceipt(id: string): Promise<void> {
  await api.delete(`/api/receipts/${id}/delete_receipt/`);
  toastSuccess("receipts.toast.removed");
}

export function getReceiptSummary(query: ListQuery): Promise<ReceiptSummary> {
  return api.get<ReceiptSummary>("/api/receipts/get_summary/", query);
}

export function exportReceipts(request: ExportRequest): Promise<void> {
  return download("/api/receipts/export_receipts/", {
    method: "POST",
    body: exportBody(request),
    query: exportQuery(request),
    fallbackFilename: `receipts.${request.format}`,
  });
}

export function getDispatches(
  query: ListQuery,
): Promise<Paginated<WasteDispatch>> {
  return api.list<WasteDispatch>("/api/dispatches/get_dispatches/", query);
}

export function getDispatch(id: string): Promise<WasteDispatchDetail> {
  return api.get<WasteDispatchDetail>(`/api/dispatches/${id}/get_dispatch/`);
}

export async function createDispatch(
  payload: WasteDispatchPayload,
): Promise<WasteDispatchDetail> {
  const dispatch = await api.post<WasteDispatchDetail>(
    "/api/dispatches/create_dispatch/",
    payload,
  );
  toastSuccess("dispatches.toast.created");
  return dispatch;
}

export async function updateDispatch(
  id: string,
  payload: Partial<WasteDispatchPayload>,
): Promise<WasteDispatchDetail> {
  const dispatch = await api.patch<WasteDispatchDetail>(
    `/api/dispatches/${id}/update_dispatch/`,
    payload,
  );
  toastSuccess("dispatches.toast.updated");
  return dispatch;
}

export async function deleteDispatch(id: string): Promise<void> {
  await api.delete(`/api/dispatches/${id}/delete_dispatch/`);
  toastSuccess("dispatches.toast.removed");
}

/** Record that the lorry has left. The time is the server's, not the device's. */
export async function releaseDispatch(
  id: string,
  payload: { released_by_name: string },
): Promise<WasteDispatchDetail> {
  const dispatch = await api.post<WasteDispatchDetail>(
    `/api/dispatches/${id}/release_dispatch/`,
    payload,
  );
  toastSuccess("dispatches.toast.released");
  return dispatch;
}

export async function cancelDispatch(
  id: string,
  reason: string,
): Promise<WasteDispatchDetail> {
  const dispatch = await api.post<WasteDispatchDetail>(
    `/api/dispatches/${id}/cancel_dispatch/`,
    { reason },
  );
  toastSuccess("dispatches.toast.cancelled");
  return dispatch;
}

/** Recyclers a load may be sent to. Live accounts only, by design. */
export function getRecyclerOptions(
  project: string,
  search?: string,
): Promise<{ results: RecyclerOption[]; count: number }> {
  return api.get<{ results: RecyclerOption[]; count: number }>(
    "/api/dispatches/get_recyclers/",
    search ? { project, search } : { project },
  );
}

export function getDispatchSummary(query: ListQuery): Promise<DispatchSummary> {
  return api.get<DispatchSummary>("/api/dispatches/get_summary/", query);
}

export function exportDispatches(request: ExportRequest): Promise<void> {
  return download("/api/dispatches/export_dispatches/", {
    method: "POST",
    body: exportBody(request),
    query: exportQuery(request),
    fallbackFilename: `dispatches.${request.format}`,
  });
}
