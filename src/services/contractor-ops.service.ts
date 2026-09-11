import type { ListQuery, Paginated } from "@/interfaces/api";
import type { ExportRequest } from "@/services/contractor.service";
import type {
  ArchiveQueueDetail,
  ArchiveQueuePage,
  ArchiveRecordKind,
  ConstructionPhase,
  DisposalEvidence,
  DisposalEvidenceKind,
  DisposalRequest,
  ExternalDisposalTask,
  EquipmentMovement,
  EquipmentSummary,
  EquipmentPayload,
  FieldTask,
  FieldTaskPayload,
  MaterialOutgoing,
  ProjectCategory,
  ProjectCategoryPayload,
  ProjectResponsibility,
  SiteEquipment,
  SiteProgressRecord,
} from "@/interfaces/contractor-ops";
import { api, download, toastSuccess } from "@/services/api-client";

export const getProjectCategories = (query: ListQuery) =>
  api.list<ProjectCategory>("/api/project-categories/get_categories/", query);
export const createProjectCategory = async (payload: ProjectCategoryPayload) => {
  const row = await api.post<ProjectCategory>("/api/project-categories/create_category/", payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
};
export const updateProjectCategory = async (id: string, payload: Partial<ProjectCategoryPayload>) => {
  const row = await api.patch<ProjectCategory>(`/api/project-categories/${id}/update_category/`, payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
};
/**
 * Open a material column from the field, while the delivery is at the gate.
 *
 * The narrow counterpart of `createProjectCategory`. Site staff hold
 * `receipt.create` and not `category.manage`, so they could not create a
 * column at all - a delivery of something nobody had set up a column for could
 * only be filed nowhere, and the OCR classifier could only ever suggest a
 * column that already existed (F-200, T-161).
 *
 * The server decides everything except the name and the project: the column is
 * always a material column, always in a project the caller is on, and never
 * carries a budget or an access restriction. Asking twice for the same name
 * returns the existing column rather than an error, because the field app
 * retries.
 */
export const createMaterialColumn = async (payload: {
  project: string;
  name: string;
}) => {
  const row = await api.post<ProjectCategory>(
    "/api/project-categories/create_material_column/",
    payload,
    { silent: true },
  );
  return row;
};

export const deleteProjectCategory = async (id: string) => {
  await api.delete(`/api/project-categories/${id}/delete_category/`);
  toastSuccess("contractorOps.toast.removed");
};

export async function createCategoryFieldSubmission(payload: {
  category: string;
  project: string;
  note?: string;
  captured_at: string;
  latitude: string;
  longitude: string;
  accuracy_m?: string;
  device_id: string;
  client_event_id: string;
  photos: File[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "category" || key === "photos") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  return api.post<FieldTask>(
    `/api/project-categories/${payload.category}/submit_evidence/`,
    data,
    { silent: true },
  );
}

export const getProjectResponsibilities = (query: ListQuery) =>
  api.list<ProjectResponsibility>("/api/project-team/get_responsibilities/", query);
export const createProjectResponsibility = (payload: Omit<ProjectResponsibility, "id" | "user_name" | "user_phone" | "created_at" | "updated_at">) =>
  api.post<ProjectResponsibility>("/api/project-team/create_responsibility/", payload);
export const updateProjectResponsibility = (
  id: string,
  payload: Partial<Pick<ProjectResponsibility, "responsibility" | "is_primary" | "can_confirm_progress" | "is_active">>,
) => api.patch<ProjectResponsibility>(`/api/project-team/${id}/update_responsibility/`, payload);
export const deleteProjectResponsibility = (id: string) =>
  api.delete(`/api/project-team/${id}/delete_responsibility/`);

export const getFieldTasks = (query: ListQuery = {}) =>
  api.list<FieldTask>("/api/field-tasks/get_tasks/", query);
export const getFieldTask = (id: string) =>
  api.get<FieldTask>(`/api/field-tasks/${id}/get_task/`);
export const createFieldTask = async (payload: FieldTaskPayload) => {
  const references = payload.references ?? [];
  let body: FieldTaskPayload | FormData = payload;
  if (references.length) {
    const data = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (key === "references" || value === undefined || value === null || value === "") continue;
      data.append(key, String(value));
    }
    references.forEach((file) => data.append("references", file));
    body = data;
  }
  const row = await api.post<FieldTask>("/api/field-tasks/create_task/", body);
  toastSuccess("contractorOps.toast.taskAssigned");
  return row;
};
/**
 * Correct a task that has not been worked yet.
 *
 * Refused with 409 once the task is anything but open or returned - from the
 * moment someone starts walking the site, the instructions they were given
 * are what the evidence answers to, and editing them afterwards would make
 * the photos look like a reply to a question nobody was asked. The console
 * offers the control only in those two states.
 */
export const updateFieldTask = async (
  id: string,
  payload: Partial<Omit<FieldTaskPayload, "project" | "references" | "client_event_id">>,
) => {
  const row = await api.patch<FieldTask>(`/api/field-tasks/${id}/update_task/`, payload);
  toastSuccess("contractorOps.toast.taskUpdated");
  return row;
};

/**
 * Hand a drawing or a photo to whoever is doing the work.
 *
 * A separate endpoint rather than part of the edit, because it is additive:
 * references already sent stay, and the same 409 applies once the task has
 * left the open or returned state.
 */
export const addFieldTaskReferences = async (id: string, files: File[]) => {
  const data = new FormData();
  files.forEach((file) => data.append("references", file));
  const row = await api.post<FieldTask>(`/api/field-tasks/${id}/add_reference/`, data);
  toastSuccess("contractorOps.toast.referenceAdded");
  return row;
};

export const transitionFieldTask = async (id: string, status: FieldTask["status"], note = "") => {
  const row = await api.post<FieldTask>(`/api/field-tasks/${id}/transition_task/`, { status, note });
  toastSuccess("contractorOps.toast.taskUpdated");
  return row;
};
export const addFieldTaskPhoto = async (
  id: string,
  file: File,
  metadata: { caption?: string; captured_at: string; latitude?: string; longitude?: string; accuracy_m?: string; device_id?: string; client_event_id: string },
) => {
  const data = new FormData();
  data.append("image", file);
  for (const [key, value] of Object.entries(metadata)) if (value) data.append(key, value);
  return api.post<FieldTask>(`/api/field-tasks/${id}/add_photo/`, data);
};

export async function createConsultantFieldSubmission(payload: {
  project: string;
  note?: string;
  application_category: string;
  description: string;
  work_location?: string;
  captured_at: string;
  latitude: string;
  longitude: string;
  accuracy_m?: string;
  device_id?: string;
  client_event_id: string;
  field_task?: string;
  photos: File[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "photos") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  return api.post<FieldTask>(
    "/api/field-tasks/create_consultant_submission/",
    data,
    { silent: true },
  );
}

/**
 * Put a category where it belongs in the list.
 *
 * The whole run is sent at once because the API checks every row before it
 * writes any: a reorder that half applied would leave two categories claiming
 * the same place, which reads on screen as an arbitrary order rather than a
 * failure.
 */
export const reorderProjectCategories = async (
  items: Array<{ id: string; sort_order: number }>,
) => {
  await api.post("/api/project-categories/reorder_categories/", { items });
  toastSuccess("contractorOps.toast.orderSaved");
};

export const getSiteEquipment = (query: ListQuery = {}) =>
  api.list<SiteEquipment>("/api/site-equipment/get_equipment/", query);
export const createSiteEquipment = async (payload: EquipmentPayload) => {
  const row = await api.post<SiteEquipment>("/api/site-equipment/create_equipment/", payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
};
/**
 * Correct an equipment record.
 *
 * The movements already logged against it are untouched - this is the plate
 * and the serial number on the register, not the history of what went in and
 * out. Retiring a machine is `is_active`, which stops it being offered on a
 * new movement without hiding the ones already recorded.
 */
export const updateSiteEquipment = async (
  id: string,
  payload: Partial<Omit<EquipmentPayload, "project">>,
) => {
  const row = await api.patch<SiteEquipment>(
    `/api/site-equipment/${id}/update_equipment/`,
    payload,
  );
  toastSuccess("contractorOps.toast.saved");
  return row;
};

export const getEquipmentMovements = (query: ListQuery = {}) =>
  api.list<EquipmentMovement>("/api/site-equipment/get_movements/", query);
export function exportEquipmentMovements(request: ExportRequest): Promise<void> {
  const { page, page_size, ...query } = request.query;
  void page;
  void page_size;
  return download("/api/site-equipment/export_movements/", {
    method: "POST",
    query,
    body: {
      format: request.format,
      title: request.title,
      subtitle: request.subtitle ?? "",
      empty_label: request.emptyLabel ?? "",
      columns: request.columns,
    },
    fallbackFilename: `equipment-movements.${request.format}`,
  });
}
export const getEquipmentSummary = (project?: string) =>
  api.get<EquipmentSummary>(
    "/api/site-equipment/get_summary/",
    project ? { project } : undefined,
  );
export async function ocrEquipmentDeliveryNote(project: string, image: File) {
  const data = new FormData();
  data.append("project", project);
  data.append("image", image);
  return api.post<{
    status: string;
    provider?: string;
    content?: string;
    suggestions?: Record<string, string>;
  }>("/api/site-equipment/ocr_delivery_note/", data);
}
export async function recordEquipmentMovement(payload: {
  project: string; equipment: string; direction: "ENTRY" | "EXIT"; delivery_note_no?: string;
  vehicle_plate?: string; operator_name: string; latitude?: string; longitude?: string;
  accuracy_m?: string; notes?: string; quantity?: string;
  unit?: "UNIT" | "PIECE" | "SET" | "LOAD" | "TONNE" | "KG" | "M3" | "OTHER";
  ocr_confirmed?: boolean;
  field_task?: string;
  delivery_note_photo?: File; original_occurred_at: string; client_event_id: string; photos: File[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "photos" || key === "delivery_note_photo") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  if (payload.delivery_note_photo) {
    data.append("delivery_note_photo", payload.delivery_note_photo);
  }
  const row = await api.post<EquipmentMovement>(
    "/api/site-equipment/record_movement/",
    data,
    { silent: true },
  );
  toastSuccess("contractorOps.toast.movementSaved");
  return row;
}

export const getConstructionPhases = (query: ListQuery = {}) =>
  api.list<ConstructionPhase>("/api/site-progress/get_phases/", query);
export const createConstructionPhase = async (payload: { project: string; code: string; name: string; description?: string; sort_order?: number; planned_weight?: string }) => {
  const row = await api.post<ConstructionPhase>("/api/site-progress/create_phase/", payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
};
/**
 * Correct a construction phase.
 *
 * Phases are typed in once and lived with for the length of the job, so a
 * mistyped code or a revised planned tonnage had to be worked around rather
 * than fixed - the backend has accepted this since the module was written and
 * no screen called it (F-101). Deactivating rather than deleting is the way
 * out of a phase nobody wants, because progress records point at it.
 */
export const updateConstructionPhase = async (
  id: string,
  payload: Partial<{
    code: string;
    name: string;
    description: string;
    sort_order: number;
    planned_weight: string;
    is_active: boolean;
  }>,
) => {
  const row = await api.patch<ConstructionPhase>(
    `/api/site-progress/${id}/update_phase/`,
    payload,
  );
  toastSuccess("contractorOps.toast.phaseSaved");
  return row;
};

export const getSiteProgressRecords = (query: ListQuery = {}) =>
  api.list<SiteProgressRecord>("/api/site-progress/get_records/", query);
/**
 * Hand over the progress list as it stands on screen.
 *
 * The filters ride along as query parameters because the API exports the
 * filtered queryset, not a fresh one - so what downloads is what the person
 * was looking at, which is the only version they can vouch for.
 */
export function exportSiteProgressRecords(request: ExportRequest): Promise<void> {
  const { page, page_size, ...query } = request.query;
  void page;
  void page_size;
  return download("/api/site-progress/export_records/", {
    method: "POST",
    query,
    body: {
      format: request.format,
      title: request.title,
      subtitle: request.subtitle ?? "",
      empty_label: request.emptyLabel ?? "",
      columns: request.columns,
    },
    fallbackFilename: `site-progress.${request.format}`,
  });
}

export const getSiteProgressSummary = (project?: string) =>
  api.get<{ today: number; month: number; year: number; total: number }>(
    "/api/site-progress/get_summary/",
    project ? { project } : undefined,
  );
export async function createSiteProgressRecord(payload: {
  project: string; phase: string; percent_complete: string; description?: string;
  captured_at: string; latitude?: string; longitude?: string; client_event_id: string; photos: File[];
  field_task?: string;
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "photos") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  const row = await api.post<SiteProgressRecord>("/api/site-progress/create_record/", data);
  toastSuccess("contractorOps.toast.progressSubmitted");
  return row;
}
export const reviewSiteProgressRecord = async (id: string, status: "CONFIRMED" | "RETURNED", note = "") => {
  const row = await api.post<SiteProgressRecord>(`/api/site-progress/${id}/review_record/`, { status, note });
  toastSuccess("contractorOps.toast.progressReviewed");
  return row;
};

/**
 * File a progress record under one of the project's progress columns.
 *
 * `null` unfiles it, which the server accepts on purpose: the office files a
 * record after the fact and may have to take it back out (D-108).
 */
export const fileProgressRecord = async (
  id: string,
  payload: { category: string | null; reason?: string },
) => {
  const row = await api.post<SiteProgressRecord>(
    `/api/site-progress/${id}/file_record/`,
    payload,
  );
  toastSuccess("contractorOps.toast.saved");
  return row;
};

export const getMaterialOutgoing = (query: ListQuery = {}): Promise<Paginated<MaterialOutgoing>> =>
  api.list<MaterialOutgoing>("/api/material-outgoing/get_records/", query);
export async function createMaterialOutgoing(payload: {
  project: string; material_name: string; quantity: string; unit: string; destination: string;
  executor_name: string; vehicle_plate?: string; delivery_note_no?: string; reason: string;
  latitude?: string; longitude?: string; client_event_id?: string;
  field_task?: string;
  photos: File[]; photo_captions?: string[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "photos" || key === "photo_captions") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo, index) => {
    data.append("photos", photo);
    const caption = payload.photo_captions?.[index];
    if (caption) data.append(`photo_caption_${index}`, caption);
  });
  const row = await api.post<MaterialOutgoing>(
    "/api/material-outgoing/create_record/",
    data,
  );
  toastSuccess("contractorOps.toast.outgoingSubmitted");
  return row;
}
export const reviewMaterialOutgoing = async (id: string, status: MaterialOutgoing["status"], note = "") => {
  const row = await api.post<MaterialOutgoing>(`/api/material-outgoing/${id}/review_record/`, { status, note });
  toastSuccess("contractorOps.toast.outgoingReviewed");
  return row;
};

export const getDisposalRequests = (query: ListQuery = {}): Promise<Paginated<DisposalRequest>> =>
  api.list<DisposalRequest>("/api/site-disposals/get_requests/", query);

export const getDisposalRequest = (id: string) =>
  api.get<DisposalRequest>(`/api/site-disposals/${id}/get_request/`);

export async function createDisposalRequest(payload: {
  project: string;
  waste_description: string;
  location_description: string;
  estimated_volume_m3?: string;
  estimated_weight_kg?: string;
  preferred_at?: string;
  request_note?: string;
  captured_at: string;
  latitude: string;
  longitude: string;
  accuracy_m: string;
  client_event_id: string;
  field_task?: string;
  photos: File[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "photos") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  const row = await api.post<DisposalRequest>("/api/site-disposals/create_request/", data);
  toastSuccess("siteDisposal.toast.requested");
  return row;
}

/** File a disposal request under one of the project's debris columns. */
export const fileDisposalRequest = async (
  id: string,
  payload: { category: string | null; reason?: string },
) => {
  const row = await api.post<DisposalRequest>(
    `/api/site-disposals/${id}/file_request/`,
    payload,
  );
  toastSuccess("contractorOps.toast.saved");
  return row;
};

export async function reviewDisposalRequest(
  id: string,
  decision: "APPROVED" | "REJECTED",
  note = "",
) {
  const row = await api.post<DisposalRequest>(
    `/api/site-disposals/${id}/review_request/`,
    { decision, note },
  );
  toastSuccess("siteDisposal.toast.reviewed");
  return row;
}

export async function assignDisposalCollector(
  id: string,
  payload: {
    collector_company_name: string;
    collector_contact_name: string;
    collector_phone: string;
    collector_email?: string;
    expires_at: string;
  },
) {
  const row = await api.post<DisposalRequest & { external_url: string; external_token: string }>(
    `/api/site-disposals/${id}/assign_collector/`,
    payload,
  );
  toastSuccess("siteDisposal.toast.assigned");
  return row;
}

export async function assignDisposalInternal(
  id: string,
  payload: { assigned_staff: string; due_at?: string },
) {
  const row = await api.post<DisposalRequest>(
    `/api/site-disposals/${id}/assign_internal/`,
    payload,
  );
  toastSuccess("siteDisposal.toast.assignedInternal");
  return row;
}

export async function regenerateDisposalExternalLink(
  id: string,
  expiresAt: string,
) {
  const row = await api.post<DisposalRequest & { external_url: string; external_token: string }>(
    `/api/site-disposals/${id}/regenerate_external_link/`,
    { expires_at: expiresAt },
  );
  toastSuccess("siteDisposal.toast.linkRegenerated");
  return row;
}

export const getInternalDisposalTask = (id: string) =>
  api.get<DisposalRequest>(`/api/site-disposals/${id}/execute_internal/`);

export const startInternalDisposalTask = (
  id: string,
  location: { latitude: string; longitude: string; accuracy_m?: string },
) => api.post<DisposalRequest>(`/api/site-disposals/${id}/execute_internal/`, {
  operation: "start",
  ...location,
});

export const addInternalDisposalEvidence = (
  id: string,
  payload: {
    kind: Exclude<DisposalEvidenceKind, "REQUEST" | "CONFIRMATION">;
    image: File;
    note?: string;
    latitude: string;
    longitude: string;
    accuracy_m?: string;
    client_event_id: string;
  },
) => {
  const data = new FormData();
  data.append("operation", "add_evidence");
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== "") {
      data.append(key, value instanceof File ? value : String(value));
    }
  }
  return api.post<{
    evidence: DisposalEvidence;
    ocr: Record<string, unknown> | null;
    ocr_status: DisposalRequest["ocr_status"];
  }>(`/api/site-disposals/${id}/execute_internal/`, data);
};

export const submitInternalDisposalTask = (
  id: string,
  payload: { actual_weight_kg: string; trip_count: number; disposal_do_no: string; note?: string },
) => api.post<DisposalRequest>(`/api/site-disposals/${id}/execute_internal/`, {
  operation: "submit",
  ...payload,
});

export async function confirmDisposalCompletion(
  id: string,
  decision: "COMPLETED" | "RETURNED",
  note: string,
  photo?: File,
  /**
   * The weight, trip count and DO number, which the outside collector no
   * longer types (T-224, D-116). Blank entries are left out of the request
   * rather than sent empty: the server treats "absent" as "leave what is
   * there", so an office confirming without touching a number cannot wipe one
   * the collector did send.
   */
  numbers?: {
    actual_weight_kg?: string;
    trip_count?: string;
    disposal_do_no?: string;
  },
) {
  const data = new FormData();
  data.append("decision", decision);
  data.append("note", note);
  if (photo) data.append("photo", photo);
  for (const [key, value] of Object.entries(numbers ?? {})) {
    if (value !== undefined && String(value).trim() !== "") {
      data.append(key, String(value));
    }
  }
  const row = await api.post<DisposalRequest>(
    `/api/site-disposals/${id}/confirm_completion/`,
    data,
  );
  toastSuccess("siteDisposal.toast.confirmed");
  return row;
}

export async function cancelDisposalRequest(id: string, reason: string) {
  const row = await api.post<DisposalRequest>(
    `/api/site-disposals/${id}/cancel_request/`,
    { reason },
  );
  toastSuccess("siteDisposal.toast.cancelled");
  return row;
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function externalDisposalFetch<T>(token: string, body?: FormData | Record<string, unknown>): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}/api/external-disposal-task/${encodeURIComponent(token)}/`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        },
  );
  const envelope = (await response.json()) as { success: boolean; data?: T; message?: string };
  if (!response.ok || !envelope.success || envelope.data === undefined) {
    throw new Error(envelope.message || "external_disposal_failed");
  }
  return envelope.data;
}

export const getExternalDisposalTask = (token: string) =>
  externalDisposalFetch<ExternalDisposalTask>(token);

export const startExternalDisposalTask = (token: string) =>
  externalDisposalFetch<ExternalDisposalTask>(token, { operation: "start" });

export const addExternalDisposalEvidence = (
  token: string,
  payload: {
    kind: Exclude<DisposalEvidenceKind, "REQUEST" | "CONFIRMATION">;
    image: File;
    note?: string;
    latitude?: string;
    longitude?: string;
    accuracy_m?: string;
    client_event_id: string;
  },
) => {
  const data = new FormData();
  data.append("operation", "add_evidence");
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== "") data.append(key, value instanceof File ? value : String(value));
  }
  return externalDisposalFetch<{ evidence: DisposalEvidence; ocr: Record<string, unknown> | null; ocr_status: DisposalRequest["ocr_status"] }>(token, data);
};

export const submitExternalDisposalTask = (
  token: string,
  // Nothing but an optional note since T-224: the outside collector
  // photographs, and the contractor types the numbers on their own screen.
  payload: { note?: string },
) => externalDisposalFetch<ExternalDisposalTask>(token, { operation: "submit", ...payload });

/**
 * The office's unarchived queue: nine kinds of record, one list (T-233).
 *
 * 客户：「全部都是属于未归档需要查看了之后才可以归档，总栏目里面是放所有归档的东西」.
 * "Unarchived" is per person - this account has not opened it yet - so two
 * readers of the same site see two different queues, which is the whole point
 * (D-106, D-063).
 *
 * `state` picks which half: the waiting one, or what this reader has already
 * been through.
 */
export function getArchiveQueue(query: {
  state?: "pending" | "archived";
  kind?: ArchiveRecordKind;
  project?: string;
  page?: number;
  page_size?: number;
}): Promise<ArchiveQueuePage> {
  return api.get<ArchiveQueuePage>("/api/archive-queue/get_queue/", query);
}

/** One queue row, opened: its fields and its photographs. */
export function getArchiveRecord(
  kind: ArchiveRecordKind,
  id: string,
): Promise<ArchiveQueueDetail> {
  return api.get<ArchiveQueueDetail>("/api/archive-queue/get_record/", {
    kind,
    id,
  });
}

/**
 * Archive rows for the person asking, and for nobody else.
 *
 * A POST rather than a side effect of opening the record: a GET that changes
 * what the next reader sees is a GET that a refresh or a link preview can fire
 * on somebody's behalf.
 */
export async function markRecordsArchived(
  records: { kind: ArchiveRecordKind; id: string }[],
): Promise<{ marked: number; matched: number }> {
  const result = await api.post<{ marked: number; matched: number }>(
    "/api/archive-queue/mark_records_seen/",
    { records },
  );
  toastSuccess("archiveQueue.toast.archived");
  return result;
}
