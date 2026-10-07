import type { DeliveryNoteOCRResult } from "@/interfaces/contractor";
import type { ListQuery, Paginated } from "@/interfaces/api";
import {
  exportBody,
  exportQuery,
  type ExportRequest,
} from "@/services/contractor.service";
import type {
  ArchiveQueueDetail,
  ArchiveQueuePage,
  ArchiveQueueRow,
  ArchiveRecordKind,
  CategoryRecordKind,
  CategoryRecordPage,
  ConstructionPhase,
  DisposalEvidence,
  DisposalEvidenceKind,
  DisposalRequest,
  DisposalSiteEvidenceKind,
  DisposalTotals,
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
  ClaimCandidatePage,
  ClaimDetail,
  ClaimKind,
  ClaimPaymentState,
  ClaimRow,
  ClaimState,
  EvidencePackageDetail,
  EvidencePackageRow,
  PackageRecordParts,
  PackageSelection,
  PackageState,
  PackagePart,
} from "@/interfaces/contractor-ops";
import type { CategoryModuleKey } from "@/lib/category-modules";
import type { ChatRecordKind } from "@/lib/record-chat";
import { api, download, fetchAsFile, fetchObjectUrl, toastSuccess } from "@/services/api-client";

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
  category?: string;
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
/** One machine's profile - for the office completing a 「新设备」 (C8). */
export const getSiteEquipmentItem = (id: string) =>
  api.get<SiteEquipment>(`/api/site-equipment/${id}/get_equipment_item/`);
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

/** The office's 【上传文件】 onto the machine's own record (T-298). */
export async function addEquipmentPhotos(id: string, files: File[], caption = "") {
  const data = new FormData();
  files.forEach((file) => data.append("photos", file));
  if (caption) data.append("caption", caption);
  const row = await api.post<SiteEquipment>(`/api/site-equipment/${id}/add_equipment_photos/`, data);
  toastSuccess("contractorOps.toast.photoAdded");
  return row;
}

/** …and onto one entry or exit (T-301, D-209). */
export async function addEquipmentMovementPhotos(movementId: string, files: File[]) {
  const data = new FormData();
  data.append("movement", movementId);
  files.forEach((file) => data.append("photos", file));
  const row = await api.post<EquipmentMovement>("/api/site-equipment/add_movement_photos/", data);
  toastSuccess("contractorOps.toast.photoAdded");
  return row;
}

export const getEquipmentMovements = (query: ListQuery = {}) =>
  api.list<EquipmentMovement>("/api/site-equipment/get_movements/", query);
export function exportEquipmentMovements(request: ExportRequest): Promise<void> {
  return download("/api/site-equipment/export_movements/", {
    method: "POST",
    query: exportQuery(request),
    // Shared body, so the per-unit totals the screen asks for reach the PDF.
    body: exportBody(request),
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
  // The same result as 材料进场's read (receiving.ocr.read_delivery_note).
  return api.post<DeliveryNoteOCRResult>("/api/site-equipment/ocr_delivery_note/", data, {
    silent: true,
  });
}
/** What the phone sends for one movement recorded on site (C8, F3, Q27). */
export interface OnSiteMovementPayload {
  project: string;
  /** Empty for a 「新设备」, which sends `equipment_name` instead (entry only). */
  equipment?: string;
  equipment_name?: string;
  /**
   * A 「新设备」's plate, optional. One already on file for this project is
   * that machine coming back: the server files the entry on it (2026-10-07).
   */
  registration_no?: string;
  supplier?: string;
  delivery_note_no: string;
  vehicle_plate?: string;
  /** An entry's remark, or why the machine is going out (optional, Q27). */
  notes?: string;
  latitude?: string;
  longitude?: string;
  accuracy_m?: string;
  ocr_confirmed?: boolean;
  ocr_proof?: string;
  field_task?: string;
  original_occurred_at: string;
  client_event_id: string;
  photos: File[];
  delivery_note_photo?: File;
  receiver_signature?: File;
  supplier_signature?: File;
}

function onSiteMovementForm(payload: OnSiteMovementPayload) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (
      key === "photos" ||
      key === "delivery_note_photo" ||
      key === "receiver_signature" ||
      key === "supplier_signature"
    ) continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  if (payload.delivery_note_photo) data.append("delivery_note_photo", payload.delivery_note_photo);
  if (payload.receiver_signature) data.append("receiver_signature", payload.receiver_signature);
  if (payload.supplier_signature) data.append("supplier_signature", payload.supplier_signature);
  return data;
}

/**
 * 设备进场 in one step (2026-10 X2, C8, F3): the machine (or a 「新设备」's
 * name), photos, DO number, the scanned supplier, both signatures and GPS.
 * No quantity or unit - one entry is one machine. The office then accepts it.
 */
export async function recordEquipmentEntry(payload: OnSiteMovementPayload) {
  const row = await api.post<EquipmentMovement>(
    "/api/site-equipment/record_entry/",
    onSiteMovementForm(payload),
    { silent: true },
  );
  toastSuccess("contractorOps.toast.entrySubmitted");
  return row;
}

/**
 * 设备退场 in one step, like the entry (2026-10 Q27): a machine on site, the
 * same evidence, and - if the worker says - why it is going. No application,
 * no Return Note. The office then accepts it; only then is it off site.
 */
export async function recordEquipmentExit(payload: OnSiteMovementPayload) {
  const row = await api.post<EquipmentMovement>(
    "/api/site-equipment/record_exit/",
    onSiteMovementForm(payload),
    { silent: true },
  );
  toastSuccess("contractorOps.toast.exitSubmitted");
  return row;
}

/**
 * Make a sub class - and its major class, when `major_name` is new - while
 * accepting a machine (Lucas 2026-10-07: the office files the machine when it
 * arrives, not in advance). A name already there is reused.
 */
export async function addEquipmentClass(payload: {
  project: string;
  major?: string;
  major_name?: string;
  name: string;
}) {
  const row = await api.post<ProjectCategory>("/api/site-equipment/add_equipment_class/", payload);
  toastSuccess("contractorOps.toast.saved");
  return row;
}

/** The office accepts an entry recorded on site, or rejects it with a reason (C8). */
export async function reviewEquipmentEntry(
  id: string,
  decision: "ACCEPTED" | "REJECTED",
  reason = "",
) {
  const row = await api.post<EquipmentMovement>(
    `/api/site-equipment/${id}/review_entry/`,
    { decision, reason },
  );
  toastSuccess("contractorOps.toast.entryReviewed");
  return row;
}

/**
 * The office accepts an exit recorded on site - the machine is then off site
 * - or rejects it with a reason, and it stays on site (Q27).
 */
export async function reviewEquipmentExit(
  id: string,
  decision: "ACCEPTED" | "REJECTED",
  reason = "",
) {
  const row = await api.post<EquipmentMovement>(
    `/api/site-equipment/${id}/review_exit/`,
    { decision, reason },
  );
  toastSuccess("contractorOps.toast.entryReviewed");
  return row;
}

/**
 * 「直接交接」 of an application made before the one-step flow (X2, Q27):
 * photos and both signatures; it then waits for the office's acceptance.
 */
export async function recordEquipmentMovement(payload: {
  project: string; equipment: string; direction: "ENTRY" | "EXIT"; delivery_note_no?: string;
  movement?: string; receiver_signature?: File; supplier_signature?: File;
  vehicle_plate?: string; operator_name: string; latitude?: string; longitude?: string;
  accuracy_m?: string; notes?: string; quantity?: string;
  unit?: "UNIT" | "PIECE" | "SET" | "LOAD" | "TONNE" | "KG" | "M3" | "OTHER";
  ocr_confirmed?: boolean;
  /** The phone's signed DO read; the server keeps it rather than reading again (A9). */
  ocr_proof?: string;
  field_task?: string;
  delivery_note_photo?: File; original_occurred_at: string; client_event_id: string; photos: File[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (
      key === "photos" ||
      key === "delivery_note_photo" ||
      key === "receiver_signature" ||
      key === "supplier_signature"
    ) continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.photos.forEach((photo) => data.append("photos", photo));
  if (payload.delivery_note_photo) {
    data.append("delivery_note_photo", payload.delivery_note_photo);
  }
  if (payload.receiver_signature) data.append("receiver_signature", payload.receiver_signature);
  if (payload.supplier_signature) data.append("supplier_signature", payload.supplier_signature);
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
 * mistyped code or a revised progress weight had to be worked around rather
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

/**
 * Remove a construction phase (T-384, D-264).
 *
 * The server refuses while progress records still point at the phase and says
 * which; the caller shows that sentence. Mirrors `deleteProjectCategory`.
 */
export const deleteConstructionPhase = async (id: string) => {
  await api.delete(`/api/site-progress/${id}/delete_phase/`);
  toastSuccess("contractorOps.toast.removed");
};

/** The office's 【备注】 on a progress record (T-359, D-225). */
export async function addProgressRemark(id: string, body: string) {
  const row = await api.post<SiteProgressRecord>(`/api/site-progress/${id}/add_remark/`, { body });
  toastSuccess("contractorOps.toast.saved");
  return row;
}

/** The office's 【上传】 onto a progress record (T-359, D-225). */
export async function addProgressPhotos(id: string, files: File[]) {
  const data = new FormData();
  files.forEach((file) => data.append("photos", file));
  const row = await api.post<SiteProgressRecord>(`/api/site-progress/${id}/add_photos/`, data);
  toastSuccess("contractorOps.toast.photoAdded");
  return row;
}

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
  return download("/api/site-progress/export_records/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `site-progress.${request.format}`,
  });
}

export const getSiteProgressSummary = (project?: string) =>
  api.get<{
    today: number;
    month: number;
    year: number;
    total: number;
    /** With a project: Σ(phase weight × latest confirmed %) ÷ Σ weight (D-127); null with no phases. */
    weighted_progress?: string | null;
    phases_counted?: number;
    weight_total?: string;
  }>(
    "/api/site-progress/get_summary/",
    project ? { project } : undefined,
  );
export async function createSiteProgressRecord(payload: {
  project: string; category?: string; phase: string; percent_complete: string; description?: string;
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

export const getMaterialOutgoing = (query: ListQuery = {}): Promise<Paginated<MaterialOutgoing>> =>
  api.list<MaterialOutgoing>("/api/material-outgoing/get_records/", query);
/**
 * The phone's application to send material back (2026-10 C9): a material
 * category (its unit comes with it), the quantity, the plate, the reason and
 * the photographs. The supplier is optional and no original delivery is
 * chosen (X20); `source_receipt` stays for a job queued by an older build.
 */
export async function createMaterialOutgoing(payload: {
  project: string;
  supplier?: string; source_receipt?: string;
  /** Whose make (2026-10 D1); the server takes the delivery's when absent. */
  manufacturer?: string;
  category?: string; material_name?: string; quantity: string; unit?: string; destination?: string;
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
/** One application with its photographs split by step (T-358). */
export const getMaterialOutgoingRecord = (id: string) =>
  api.get<MaterialOutgoing>(`/api/material-outgoing/${id}/get_record/`);

/** The list as PDF or spreadsheet, with per-unit totals at the foot (T-358). */
export function exportMaterialOutgoing(request: ExportRequest): Promise<void> {
  return download("/api/material-outgoing/export_records/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `material-outgoing.${request.format}`,
  });
}

/**
 * The material actually leaving, on the same record (2026-10 C9).
 *
 * Photographs, what actually left, the plate, the DO, the supplier (scanned
 * or as the office named it) and both signatures. It then waits for the
 * office's confirmation (PROCESSED, 待后台确认).
 */
export async function returnMaterialOutgoingProcessing(
  id: string,
  payload: {
    photos: File[];
    note?: string;
    latitude?: string;
    longitude?: string;
    /** What actually left, and both sides' signatures as it went. */
    returned_quantity: string;
    site_signature: File;
    supplier_signature: File;
    vehicle_plate?: string;
    delivery_note_no?: string;
    /** As confirmed at the exit - scanned, or chosen. */
    supplier?: string;
    /** The material category, when what left is not what was applied for. */
    category?: string;
    /** One per exit, the same on every try (Q29.3): a replay is not a second exit. */
    client_event_id?: string;
  },
) {
  const data = new FormData();
  payload.photos.forEach((file) => data.append("photos", file));
  if (payload.client_event_id) data.append("client_event_id", payload.client_event_id);
  data.append("returned_quantity", payload.returned_quantity);
  data.append("site_signature", payload.site_signature);
  data.append("supplier_signature", payload.supplier_signature);
  for (const key of ["vehicle_plate", "delivery_note_no", "supplier", "category"] as const) {
    if (payload[key]) data.append(key, payload[key] as string);
  }
  if (payload.note) data.append("note", payload.note);
  if (payload.latitude) data.append("latitude", payload.latitude);
  if (payload.longitude) data.append("longitude", payload.longitude);
  const row = await api.post<MaterialOutgoing>(
    `/api/material-outgoing/${id}/return_processing/`,
    data,
  );
  toastSuccess("contractorOps.toast.outgoingProcessed");
  return row;
}

/** 【上传文件】 on the office side (T-358), as a material receipt has. */
export async function addMaterialOutgoingPhotos(id: string, files: File[]) {
  const data = new FormData();
  files.forEach((file) => data.append("photos", file));
  const row = await api.post<MaterialOutgoing>(
    `/api/material-outgoing/${id}/add_photos/`,
    data,
  );
  toastSuccess("contractorOps.toast.saved");
  return row;
}

/**
 * The office's Return Note (2026-10 C9): what the approval is made on.
 * The approver's signature is required the first time and kept after.
 */
export async function fillReturnNote(
  id: string,
  payload: {
    material: string;
    delivery_note_no?: string;
    supplier?: string;
    quantity: string;
    unit?: string;
    reason: string;
    approver_name?: string;
    approver_signature?: File;
  },
) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === "") continue;
    data.append(key, value instanceof File ? value : String(value));
  }
  const row = await api.post<MaterialOutgoing>(
    `/api/material-outgoing/${id}/fill_return_note/`,
    data,
  );
  toastSuccess("contractorOps.toast.returnNoteSaved");
  return row;
}

export const reviewMaterialOutgoing = async (id: string, status: MaterialOutgoing["status"], note = "") => {
  const row = await api.post<MaterialOutgoing>(`/api/material-outgoing/${id}/review_record/`, { status, note });
  toastSuccess("contractorOps.toast.outgoingReviewed");
  return row;
};

export const getDisposalRequests = (query: ListQuery = {}): Promise<Paginated<DisposalRequest>> =>
  api.list<DisposalRequest>("/api/site-disposals/get_requests/", query);

/** 工地清运 as PDF or spreadsheet, with the list's filters (T-361). */
export function exportDisposalRequests(request: ExportRequest): Promise<void> {
  return download("/api/site-disposals/export_requests/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `site-disposals.${request.format}`,
  });
}

export const getDisposalRequest = (id: string) =>
  api.get<DisposalRequest>(`/api/site-disposals/${id}/get_request/`);

export async function createDisposalRequest(payload: {
  project: string;
  category?: string;
  waste_description: string;
  location_description: string;
  estimated_volume_m3?: string;
  estimated_weight_kg?: string;
  preferred_at?: string;
  request_note?: string;
  /** 「预计车次」 (X11): how many lorries the site expects. */
  planned_trips?: string;
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

/**
 * Approve or reject a disposal request.
 *
 * Approving also mints the temporary link and returns it **once** (D-217):
 * 「清运申请批准后临时链接发给**申请人**，由申请人通过 WhatsApp 转给司机。」
 * Only the hash is stored, so this response is the single chance to copy it -
 * which is why the dialog shows it instead of closing on success.
 */
export async function reviewDisposalRequest(
  id: string,
  decision: "APPROVED" | "REJECTED",
  note = "",
  plannedTrips?: number,
) {
  const row = await api.post<
    DisposalRequest & { external_url?: string; external_link_due_hours?: number }
  >(`/api/site-disposals/${id}/review_request/`, {
    decision,
    note,
    // Approval makes this many lorries (X11); the site's number otherwise.
    ...(decision === "APPROVED" && plannedTrips ? { planned_trips: plannedTrips } : {}),
  });
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

/** One lorry's proof, weight and DO (X11): the office then checks it. */
export const submitInternalDisposalTask = (
  id: string,
  payload: { actual_weight_kg: string; disposal_do_no: string; note?: string },
) => api.post<DisposalRequest>(`/api/site-disposals/${id}/execute_internal/`, {
  operation: "submit",
  ...payload,
});

/** The office checks one lorry load (X11). The last one completes the job. */
export async function acceptDisposalTrip(id: string, trip: string) {
  const row = await api.post<DisposalRequest>(`/api/site-disposals/${id}/accept_trip/`, { trip });
  toastSuccess("siteDisposal.toast.tripAccepted");
  return row;
}

/** 「加一车」 (X11): one more lorry after the last. */
export async function addDisposalTrip(id: string) {
  const row = await api.post<DisposalRequest>(`/api/site-disposals/${id}/add_trip/`, {});
  toastSuccess("siteDisposal.toast.tripAdded");
  return row;
}

/**
 * End the job early (X11): lorries not yet sent are dropped and the driver's
 * link closes; loads already sent still wait for their check. Armed by a
 * switch on the screen, never a confirm dialog (spec rule 8).
 */
export async function endDisposalEarly(id: string, note = "") {
  const row = await api.post<DisposalRequest>(`/api/site-disposals/${id}/end_early/`, { note });
  toastSuccess("siteDisposal.toast.endedEarly");
  return row;
}

/**
 * The office fills in weight, trips and DO number after the job (D06).
 *
 * The outside driver types none of them (D-116) and E04 removed the office
 * confirmation they used to be typed on. Blank entries are left out: the
 * server reads "absent" as "leave what is there", and every change it makes
 * is appended to the timeline with the old value.
 */
export async function recordDisposalNumbers(
  id: string,
  numbers: { actual_weight_kg?: string; trip_count?: string; disposal_do_no?: string },
) {
  const body = Object.fromEntries(
    Object.entries(numbers).filter(([, value]) => value !== undefined && String(value).trim() !== ""),
  );
  const row = await api.post<DisposalRequest>(`/api/site-disposals/${id}/record_numbers/`, body);
  toastSuccess("siteDisposal.toast.numbersRecorded");
  return row;
}

/**
 * The site's photographs of the load leaving: vehicle exit, Gate Pass (C08).
 * At most four per submission, any mix of the two, note optional.
 */
export async function addDisposalSiteEvidence(
  id: string,
  payload: {
    photos: Array<{ file: File; kind: DisposalSiteEvidenceKind }>;
    note?: string;
    latitude?: string;
    longitude?: string;
    accuracy_m?: string;
    client_event_id: string;
  },
) {
  const data = new FormData();
  for (const photo of payload.photos) {
    data.append("photos", photo.file);
    data.append("kinds", photo.kind);
  }
  for (const key of ["note", "latitude", "longitude", "accuracy_m", "client_event_id"] as const) {
    const value = payload[key];
    if (value) data.append(key, value);
  }
  data.append("captured_at", new Date().toISOString());
  const row = await api.post<DisposalRequest>(`/api/site-disposals/${id}/add_site_evidence/`, data);
  toastSuccess("siteDisposal.toast.siteEvidence");
  return row;
}

/** 原工地清运's own records, trips and weight (D06) - never summed with orders. */
export const getDisposalTotals = (query: ListQuery = {}) =>
  api.get<DisposalTotals>("/api/site-disposals/get_totals/", query);

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
  /** 「未归档」 / 「已归档」 (T-391); left out for both. */
  closure?: "open" | "closed";
  kind?: ArchiveRecordKind;
  project?: string;
  /**
   * 「等你处理」 (B8): only what waits for this reader's 【确认】 - the
   * dashboard card's full list. `state` and `closure` do not apply.
   */
  waiting?: "1";
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
 * 「已看」 for the person asking, and for nobody else (D-063).
 *
 * Sent when this reader opens a row in 现场记录中心 (2026-10 C4: the sheet is
 * read-only, so there is no 「我看过了」 button any more - opening it is the
 * look). A POST the screen sends on a click rather than a side effect of the
 * GET: a GET that changed what the next reader sees is one a refresh or a
 * link preview could fire on somebody's behalf. Silent: a mark is not
 * something the reader asked to be told about, and the 未看 / 已看 column
 * shows it.
 */
export function markRecordsSeen(
  records: { kind: ArchiveRecordKind; id: string }[],
): Promise<{ marked: number; matched: number }> {
  return api.post<{ marked: number; matched: number }>(
    "/api/archive-queue/mark_records_seen/",
    { records },
    { silent: true },
  );
}

/**
 * The records filed in one Category Management column (T-396, D-276).
 *
 * Lucas: 「栏目管理里点一个栏目，同一页弹出这个栏目里的全部记录」. `module` is one
 * of the twelve keys in `category-modules.ts`; `category` is the id of the row
 * that module's table shows. Newest first; only what this account may read.
 */
export function getCategoryRecords(query: {
  module: CategoryModuleKey;
  category: string;
  page?: number;
  page_size?: number;
  /** 2026-10 B3: narrowed by supplier, date range and the search box. */
  supplier?: string;
  /** 2026-10 D1: by whose make (material only). */
  manufacturer?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}): Promise<CategoryRecordPage> {
  return api.get<CategoryRecordPage>("/api/category-records/", query);
}

/**
 * One row of a column's list, opened, in the archive queue's detail shape.
 *
 * Its own door rather than `getArchiveRecord`, which serves finished records
 * only - and a column holds the open hazard and the pending delivery too.
 */
export function getCategoryRecord(
  kind: CategoryRecordKind,
  id: string,
): Promise<ArchiveQueueDetail<CategoryRecordKind>> {
  return api.get<ArchiveQueueDetail<CategoryRecordKind>>(
    "/api/category-records/get_record/",
    { kind, id },
  );
}

/* -------------------------------------------------------------------------
 * Multi Engine (T-235)
 *
 * Two sets of calls on purpose (D-151): the contractor builds packages, the
 * consultant reviews the ones that were sent. They are different endpoints
 * behind different permissions, so they are different functions here too -
 * one function with a role flag is how a draft eventually reaches an outside
 * reviewer.
 * ---------------------------------------------------------------------- */

export const getEvidencePackages = (
  query: ListQuery & {
    project?: string;
    state?: PackageState;
    created_by?: string;
    from?: string;
    to?: string;
  },
) =>
  api.list<EvidencePackageRow>(
    "/api/evidence-packages/get_packages/",
    query,
  );

export const getEvidencePackage = (id: string) =>
  api.get<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/get_package/`,
  );

/** Records of one column in one project, to tick from. */
export const getPackageCandidates = (
  query: ListQuery & { kind: ArchiveRecordKind; project: string },
) =>
  api.list<ArchiveQueueRow>(
    "/api/evidence-packages/get_candidates/",
    query,
  );

/** One record opened for ticking: its fields, photographs and delivery orders. */
export const getPackageRecordParts = (kind: ArchiveRecordKind, id: string) =>
  api.get<PackageRecordParts>("/api/evidence-packages/get_record_parts/", {
    kind,
    id,
  });

export async function createEvidencePackage(payload: {
  project: string;
  name: string;
  remarks?: string;
}) {
  const row = await api.post<EvidencePackageDetail>(
    "/api/evidence-packages/create_package/",
    payload,
  );
  toastSuccess("multiEngine.toast.created");
  return row;
}

export async function updateEvidencePackage(
  id: string,
  payload: { name?: string; remarks?: string },
) {
  const row = await api.patch<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/update_package/`,
    payload,
  );
  toastSuccess("multiEngine.toast.saved");
  return row;
}

export async function deleteEvidencePackage(id: string) {
  await api.delete(`/api/evidence-packages/${id}/delete_package/`);
  toastSuccess("multiEngine.toast.deleted");
}

export async function addPackageItems(
  id: string,
  kind: ArchiveRecordKind,
  ids: string[],
  /** What the records carry besides their fields (D12); photos only if left out. */
  include?: PackagePart[],
) {
  const row = await api.post<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/add_items/`,
    include ? { kind, ids, include } : { kind, ids },
  );
  toastSuccess("multiEngine.toast.added", { count: ids.length });
  return row;
}

export async function updatePackageItem(
  id: string,
  item: string,
  selection: PackageSelection,
) {
  const row = await api.patch<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/update_item/`,
    { item, selection },
  );
  toastSuccess("multiEngine.toast.saved");
  return row;
}

export async function removePackageItem(id: string, item: string) {
  const row = await api.post<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/remove_item/`,
    { item },
  );
  toastSuccess("multiEngine.toast.removed");
  return row;
}

export const reorderPackageItems = (id: string, items: string[]) =>
  api.post<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/reorder_items/`,
    { items },
  );

export async function confirmEvidencePackage(id: string, remarks: string) {
  const row = await api.post<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/confirm_package/`,
    { remarks },
  );
  toastSuccess("multiEngine.toast.confirmed");
  return row;
}

/**
 * Open the merged PDF in the browser without downloading it (T-364, D-235:
 * 「不需要先下载」). Not counted as the package having left.
 */
export const previewEvidencePackage = (id: string, name: string) =>
  download(`/api/evidence-packages/${id}/download_package/`, {
    query: { inline: "1" },
    fallbackFilename: `${name || "package"}.pdf`,
    openInNewTab: true,
  });

/** Download the merged PDF. The server notes that it left (D-148). */
export const downloadEvidencePackage = (id: string, name: string) =>
  download(`/api/evidence-packages/${id}/download_package/`, {
    fallbackFilename: `${name || "package"}.pdf`,
  });

/**
 * One record out of a package, as its own PDF (T-348).
 *
 * 客户举例：「DO 可以直接 export」. The whole bundle stays where it was; this is
 * for the case where somebody needs one delivery order and was previously
 * sending forty pages with an instruction about which one to read.
 */
export const downloadPackageItem = (
  packageId: string,
  itemId: string,
  reference: string,
) =>
  download(
    `/api/evidence-packages/${packageId}/download_item/?item=${encodeURIComponent(itemId)}`,
    { fallbackFilename: `${reference || "record"}.pdf` },
  );

/**
 * The kinds a record can be exported as its own PDF from (T-386, D-267).
 *
 * The nine the office opens a detail for. ATTENDANCE_DAY is not one: a day of
 * attendance is an aggregate with no primary key, so there is no one record to
 * print.
 */
export type ExportableRecordKind = Exclude<ArchiveRecordKind, "ATTENDANCE_DAY">;

/**
 * The same nine as a value, mirroring the backend's `archive_queue.SOURCES`.
 *
 * A column's list (T-396) also holds a delivery note, a site record, a
 * registered machine, a document and a period claim - none of which the
 * export endpoint prints, so their detail gets no button rather than one that
 * always answers "not a kind that can be exported".
 */
export const EXPORTABLE_RECORD_KINDS: readonly ExportableRecordKind[] = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "HAZARD",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "CONSULTANT_APPLICATION",
  "SUNDRY_CLAIM",
];

export function isExportableKind(kind: string): kind is ExportableRecordKind {
  return (EXPORTABLE_RECORD_KINDS as readonly string[]).includes(kind);
}

/**
 * One record as its own PDF, straight from its detail (T-386, D-267).
 *
 * 「每个模块都是一样可以单独导出」: the same layout as a package's single item
 * (`downloadPackageItem`), without first having to put the record in a
 * package. Who may see the record is the server's decision; an error comes
 * back as the usual envelope and `download` toasts it.
 */
export const downloadRecordPdf = (
  kind: ExportableRecordKind,
  recordId: string,
  reference: string,
) =>
  download("/api/record-exports/download/", {
    query: { kind, record: recordId },
    // Only used when the server sends no filename. Some references are
    // labels rather than numbers (a progress record's 「phase / 40%」), so
    // the characters a filename cannot hold become dashes.
    fallbackFilename: `${(reference || "record").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`,
  });

/** The same PDF, fetched to read or print in the page (D12); the caller revokes it. */
export const recordPdfObjectUrl = (kind: ExportableRecordKind, recordId: string) =>
  fetchObjectUrl("/api/record-exports/download/", {
    query: { kind, record: recordId, inline: "1" },
  });

/** The same PDF as a `File`, for the phone's share sheet (2026-10 C11). */
export const recordPdfFile = (kind: ExportableRecordKind, recordId: string, reference: string) =>
  fetchAsFile("/api/record-exports/download/", {
    query: { kind, record: recordId },
    fallbackFilename: `${(reference || "record").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`,
  });

export async function sendPackageForReview(id: string, consultant: string) {
  const row = await api.post<EvidencePackageDetail>(
    `/api/evidence-packages/${id}/send_for_review/`,
    { consultant },
  );
  toastSuccess("multiEngine.toast.sent");
  return row;
}

/* -- the consultant's side ------------------------------------------------ */

export const getPackagesToReview = (query: ListQuery) =>
  api.list<EvidencePackageRow>(
    "/api/package-reviews/get_review_packages/",
    query,
  );

export const getPackageToReview = (id: string) =>
  api.get<EvidencePackageDetail>(
    `/api/package-reviews/${id}/get_review_package/`,
  );

export async function reviewPackageItem(
  id: string,
  item: string,
  decision: "ACCEPTED" | "RETURNED",
  reason = "",
) {
  const row = await api.post<EvidencePackageDetail>(
    `/api/package-reviews/${id}/review_item/`,
    { item, decision, reason },
  );
  toastSuccess(
    decision === "ACCEPTED"
      ? "multiEngine.toast.accepted"
      : "multiEngine.toast.returned",
  );
  return row;
}


/* -------------------------------------------------------------------------
 * Claim Engine (T-236)
 *
 * There is no consultant-side function here on purpose. A confirmed claim
 * is reviewed as its evidence package, through `getPackagesToReview` /
 * `reviewPackageItem` above (D-158) - and a returned member marks the claim
 * item on the server, so this screen learns about it by re-reading the
 * claim rather than by a second review call of its own.
 * ---------------------------------------------------------------------- */

export const getClaims = (
  query: ListQuery & {
    project?: string;
    kind?: ClaimKind;
    state?: ClaimState;
    payment_state?: ClaimPaymentState;
    period?: string;
    /** A CLAIM column (D-275); `uncategorised: "true"` asks for 未归类 instead. */
    category?: string;
    uncategorised?: "true";
  },
) => api.list<ClaimRow>("/api/claims/get_claims/", query);

export const getClaim = (id: string) =>
  api.get<ClaimDetail>(`/api/claims/${id}/get_claim/`);

/**
 * This period's candidates, and the four counts above them (D-134).
 *
 * Not `api.list`: the payload carries the counts beside the rows, and they
 * are counted over everything eligible rather than over the page - a "12
 * eligible" that changed when you turned the page would be a different
 * number with the same name.
 */
export const getClaimCandidates = (query: {
  project: string;
  kind: ClaimKind;
  claim?: string;
}) => api.get<ClaimCandidatePage>("/api/claims/get_candidates/", query);

export async function createClaim(payload: {
  project: string;
  kind: ClaimKind;
  /** `YYYY-MM`. The server stores the first of that month (D-164). */
  period: string;
  remarks?: string;
}) {
  const row = await api.post<ClaimDetail>("/api/claims/create_claim/", payload);
  toastSuccess("claims.toast.opened");
  return row;
}

export async function deleteClaim(id: string) {
  await api.delete(`/api/claims/${id}/delete_claim/`);
  toastSuccess("claims.toast.discarded");
}

/** 勾选后自动进入本期 - ticking is what puts a record on the claim. */
export async function selectClaimItems(id: string, ids: string[]) {
  const row = await api.post<ClaimDetail>(`/api/claims/${id}/select_items/`, {
    ids,
  });
  // What actually went on, not what was asked for. The server refuses a
  // record that is already on a claim (D-163), and a toast that counted the
  // request would tell somebody five went on when three did.
  toastSuccess("claims.toast.selected", {
    count: ids.length - (row.refused?.length ?? 0),
  });
  return row;
}

export async function removeClaimItem(id: string, item: string) {
  const row = await api.post<ClaimDetail>(`/api/claims/${id}/remove_item/`, {
    item,
  });
  toastSuccess("claims.toast.removed");
  return row;
}

/**
 * 第二轮确认. Claims every ticked record and raises the merged PDF.
 *
 * `include_photos` is the customer's red pen - 「不需要照片」只有必要和 DO.
 * The delivery orders are never optional: they are what the claim is made of.
 */
export async function confirmClaim(
  id: string,
  remarks: string,
  includePhotos: boolean,
) {
  const row = await api.post<ClaimDetail>(`/api/claims/${id}/confirm_claim/`, {
    remarks,
    include_photos: includePhotos,
  });
  toastSuccess("claims.toast.confirmed");
  return row;
}

/** 收款状态. Behind its own permission code (D-136). */
export async function setClaimPayment(
  id: string,
  payload: { payment_state: ClaimPaymentState; payment_note?: string },
) {
  const row = await api.post<ClaimRow>(
    `/api/claims/${id}/set_payment/`,
    payload,
  );
  toastSuccess("claims.toast.payment");
  return row;
}

/* -------------------------------------------------------------------------
 * Record conversations (T-339 / T-340)
 *
 * One pair of calls for every module that hangs a chat off a record. A hazard
 * keeps its own pair in `site-operations.service.ts` because it keeps its own
 * store; everything else goes through here.
 * ---------------------------------------------------------------------- */

/** One message as both conversation endpoints return it. */
export interface RecordMessage {
  id: string;
  record_kind: ArchiveRecordKind;
  record_id: string;
  author: string;
  author_name: string;
  body: string;
  photo: string | null;
  watermarked_photo: string | null;
  audio: string | null;
  audio_seconds: number | null;
  attachment: string | null;
  attachment_name: string;
  sent_at: string;
  client_event_id: string;
  created_at: string;
}

export interface RecordConversation {
  kind: ArchiveRecordKind;
  record: string;
  reference: string;
  messages: RecordMessage[];
  audio_seconds_limit: number;
  /**
   * Non-empty once the record is finished (D-278): `"archived"` after
   * 【确认归档】, `"paid"` for a sundry claim after 【确认已付款】. The history
   * stays readable; the server refuses new messages with
   * `conversation_closed`. Optional because an older server omits it.
   */
  closed?: "" | "archived" | "paid" | "decided";
}

export function getRecordConversation(
  kind: ChatRecordKind,
  record: string,
): Promise<RecordConversation> {
  return api.get<RecordConversation>("/api/record-chat/get_conversation/", {
    kind,
    record,
  });
}

/**
 * Say something on a record: text, voice, photo or file.
 *
 * Voice is not a convenience. The customer described part of their crew as
 * 「不识字」, so without it the conversation is unavailable to exactly the
 * people these six modules need in it (D-094).
 */
export function postRecordMessage(
  kind: ChatRecordKind,
  record: string,
  payload: {
    body?: string;
    photo?: File;
    audio?: File;
    audio_seconds?: number;
    attachment?: File;
    attachment_name?: string;
    client_event_id?: string;
  },
): Promise<RecordMessage> {
  const data = new FormData();
  data.append("kind", kind);
  data.append("record", record);
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    data.append(key, value instanceof File ? value : String(value));
  }
  return api.post<RecordMessage>("/api/record-chat/post_message/", data);
}

/**
 * Whether one record has been confirmed finished, and by whom (D-234).
 *
 * The confirmer's name travels with the answer rather than being looked up,
 * because the server stores the name as it stood at confirmation: a person who
 * is later renamed or deactivated must not change what an archived record says.
 */
export interface RecordClosureState {
  kind: ArchiveRecordKind;
  record: string;
  /**
   * Whether the record's own steps are done and only this 【确认】 is left
   * (C4): a delivery once accepted, an application once finished. The same
   * rule 「等你处理」 counts by, so a page offers the button exactly when the
   * dashboard says the record is waiting for it.
   */
  ready: boolean;
  closed: boolean;
  closure: {
    confirmed_by: string;
    confirmed_by_name: string;
    confirmed_at: string;
    note: string;
  } | null;
}

export function getRecordClosure(
  kind: ArchiveRecordKind,
  record: string,
): Promise<RecordClosureState> {
  return api.get<RecordClosureState>("/api/record-closure/get_closure/", {
    kind,
    record,
  });
}

/**
 * The final 【确认】 that archives a record (D-234).
 *
 * It checks nothing first, on purpose: 「系统不再判断沟通有没有结束、付款凭证
 * 够不够…负责人确认早了是他的操作责任」. What the system does instead is record
 * who pressed it.
 */
export function confirmRecordClosure(
  kind: ArchiveRecordKind,
  record: string,
  note?: string,
): Promise<RecordClosureState> {
  return api.post<RecordClosureState>("/api/record-closure/confirm_record/", {
    kind,
    record,
    note: note ?? "",
  });
}
