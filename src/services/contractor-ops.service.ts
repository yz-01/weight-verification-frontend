import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ConstructionPhase,
  DisposalEvidence,
  DisposalEvidenceKind,
  DisposalRequest,
  ExternalDisposalTask,
  EquipmentMovement,
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
import { api, toastSuccess } from "@/services/api-client";

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
export const deleteProjectCategory = async (id: string) => {
  await api.delete(`/api/project-categories/${id}/delete_category/`);
  toastSuccess("contractorOps.toast.removed");
};

export const getProjectResponsibilities = (query: ListQuery) =>
  api.list<ProjectResponsibility>("/api/project-team/get_responsibilities/", query);
export const createProjectResponsibility = (payload: Omit<ProjectResponsibility, "id" | "user_name" | "user_phone" | "created_at" | "updated_at">) =>
  api.post<ProjectResponsibility>("/api/project-team/create_responsibility/", payload);
export const deleteProjectResponsibility = (id: string) =>
  api.delete(`/api/project-team/${id}/delete_responsibility/`);

export const getFieldTasks = (query: ListQuery = {}) =>
  api.list<FieldTask>("/api/field-tasks/get_tasks/", query);
export const getFieldTask = (id: string) =>
  api.get<FieldTask>(`/api/field-tasks/${id}/get_task/`);
export const createFieldTask = async (payload: FieldTaskPayload) => {
  const row = await api.post<FieldTask>("/api/field-tasks/create_task/", payload);
  toastSuccess("contractorOps.toast.taskAssigned");
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
  captured_at: string;
  latitude: string;
  longitude: string;
  accuracy_m?: string;
  device_id?: string;
  client_event_id: string;
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

export const getSiteEquipment = (query: ListQuery = {}) =>
  api.list<SiteEquipment>("/api/site-equipment/get_equipment/", query);
export const createSiteEquipment = async (payload: EquipmentPayload) => {
  const row = await api.post<SiteEquipment>("/api/site-equipment/create_equipment/", payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
};
export const getEquipmentMovements = (query: ListQuery = {}) =>
  api.list<EquipmentMovement>("/api/site-equipment/get_movements/", query);
export async function recordEquipmentMovement(payload: {
  project: string; equipment: string; direction: "ENTRY" | "EXIT"; delivery_note_no?: string;
  vehicle_plate?: string; operator_name: string; latitude?: string; longitude?: string;
  accuracy_m?: string; notes?: string; original_occurred_at: string; client_event_id: string; photos: File[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "photos") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  const row = await api.post<EquipmentMovement>("/api/site-equipment/record_movement/", data);
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
export const getSiteProgressRecords = (query: ListQuery = {}) =>
  api.list<SiteProgressRecord>("/api/site-progress/get_records/", query);
export async function createSiteProgressRecord(payload: {
  project: string; phase: string; percent_complete: string; description?: string;
  captured_at: string; latitude?: string; longitude?: string; client_event_id: string; photos: File[];
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

export const getMaterialOutgoing = (query: ListQuery = {}): Promise<Paginated<MaterialOutgoing>> =>
  api.list<MaterialOutgoing>("/api/material-outgoing/get_records/", query);
export const createMaterialOutgoing = async (payload: {
  project: string; material_name: string; quantity: string; unit: string; destination: string;
  executor_name: string; vehicle_plate?: string; delivery_note_no?: string; reason: string;
  latitude?: string; longitude?: string; client_event_id?: string;
}) => {
  const row = await api.post<MaterialOutgoing>("/api/material-outgoing/create_record/", payload);
  toastSuccess("contractorOps.toast.outgoingSubmitted");
  return row;
};
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

export async function confirmDisposalCompletion(
  id: string,
  decision: "COMPLETED" | "RETURNED",
  note: string,
  photo?: File,
) {
  const data = new FormData();
  data.append("decision", decision);
  data.append("note", note);
  if (photo) data.append("photo", photo);
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
  payload: { actual_weight_kg: string; trip_count: number; disposal_do_no: string; note?: string },
) => externalDisposalFetch<ExternalDisposalTask>(token, { operation: "submit", ...payload });
