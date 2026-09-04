import { ApiError } from "@/interfaces/api";
import type { AttendanceEvent } from "@/interfaces/site-operations";
import type { SafetyIncidentPayload } from "@/interfaces/site-operations";
import type { MaterialReceiptPayload } from "@/interfaces/contractor";
import type { TaskPositionEvent, TaskState } from "@/interfaces/recycler";
import {
  countOfflineJobs,
  deleteOfflineJob,
  getOfflineJobs,
  type OfflineJob,
  putOfflineJob,
  restoreFile,
  storeFile,
} from "@/lib/offline-db";
import {
  api,
  toastSuccess,
  withOfflineProvenance,
} from "@/services/api-client";
import { createReceiptWithEvidence } from "@/services/contractor.service";
import {
  createDisposalRequest,
  createCategoryFieldSubmission,
  createConsultantFieldSubmission,
  createMaterialOutgoing,
  createSiteProgressRecord,
  recordEquipmentMovement,
} from "@/services/contractor-ops.service";
import { createSafetyIncident } from "@/services/site-operations.service";
import { createWasteOutgoingRecord } from "@/services/waste-outgoing.service";
import {
  cleanupSettledDriverSnapshots,
  recordDriverTaskPhotoLocally,
  recordDriverTaskTransitionLocally,
} from "@/services/driver-offline.service";

export const OFFLINE_QUEUE_CHANGED = "mse:offline-queue-changed";

interface AttendanceDraft {
  project: string;
  event: AttendanceEvent;
  note?: string;
  latitude?: string;
  longitude?: string;
  locationAccuracyM?: string;
  photo?: File;
}

interface TaskTransitionDraft {
  taskId: string;
  state: TaskState;
  latitude?: string;
  longitude?: string;
  notes?: string;
  reason?: string;
}

interface TaskPositionDraft {
  taskId: string;
  eventType?: TaskPositionEvent;
  latitude: string;
  longitude: string;
  accuracyM?: string;
  originalOccurredAt?: string;
}

interface FieldTaskPhotoDraft {
  taskId: string;
  file: File;
  caption?: string;
  latitude?: string;
  longitude?: string;
  accuracyM?: string;
  deviceId?: string;
}

interface MaterialReceiptDraft {
  receipt: MaterialReceiptPayload;
  signature: File;
  supplierSignature: File;
  deliveryNotePhoto?: File;
  sitePhotos: File[];
  deviceId: string;
}

export type OfflineSubmission = "uploaded" | "queued";

function newId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof ApiError && error.isNetwork;
}

function notifyQueueChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED));
  }
}

async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    // getRegistration, not `.ready`: `.ready` never resolves when no
    // service worker is registered (dev unregisters it), and awaiting it
    // here left every enqueue hanging with its dialog stuck on a spinner.
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await syncRegistration.sync?.register("mse-offline-sync");
  } catch {
    // The online listener remains the cross-browser fallback.
  }
}

async function enqueue(job: OfflineJob): Promise<OfflineSubmission> {
  await putOfflineJob(job);
  notifyQueueChanged();
  await requestBackgroundSync();
  toastSuccess("offline.queued");
  return "queued";
}

function appendAttendance(
  data: FormData,
  job: Extract<OfflineJob, { kind: "ATTENDANCE" }>,
) {
  const payload = job.payload;
  data.append("project", payload.project);
  data.append("event", payload.event);
  data.append("note", payload.note);
  data.append("client_event_id", payload.clientEventId);
  data.append("original_occurred_at", payload.originalOccurredAt);
  if (payload.latitude) data.append("latitude", payload.latitude);
  if (payload.longitude) data.append("longitude", payload.longitude);
  if (payload.locationAccuracyM) {
    data.append("location_accuracy_m", payload.locationAccuracyM);
  }
  if (payload.photo) data.append("photo", restoreFile(payload.photo));
}

/**
 * Send one queued job, carrying the moment it was created on this device.
 *
 * The stamp is set for the whole replay rather than passed to each call:
 * eleven of the fourteen job kinds reach the server through their own service
 * function, several of which build their own FormData, so an argument would
 * leave a new offline path unstamped the day it is written.
 */
async function uploadJob(job: OfflineJob): Promise<void> {
  return withOfflineProvenance(job.queuedAt, () => sendJob(job));
}

async function sendJob(job: OfflineJob): Promise<void> {
  if (job.kind === "ATTENDANCE") {
    const data = new FormData();
    appendAttendance(data, job);
    await api.post("/api/attendance/clock/", data, { silent: true });
    return;
  }

  if (job.kind === "TASK_TRANSITION") {
    const { taskId, originalOccurredAt, clientEventId, ...payload } =
      job.payload;
    await api.post(
      `/api/tasks/${taskId}/advance_task/`,
      {
        ...payload,
        client_event_id: clientEventId,
        original_occurred_at: originalOccurredAt,
      },
      { silent: true },
    );
    return;
  }

  if (job.kind === "TASK_PHOTO") {
    const data = new FormData();
    data.append("image", restoreFile(job.payload.file));
    data.append("kind", job.payload.kind);
    data.append("taken_at", job.payload.originalOccurredAt);
    data.append("client_event_id", job.payload.clientEventId);
    if (job.payload.latitude) data.append("latitude", job.payload.latitude);
    if (job.payload.longitude) data.append("longitude", job.payload.longitude);
    await api.post(`/api/tasks/${job.payload.taskId}/add_photo/`, data, {
      silent: true,
    });
    return;
  }

  if (job.kind === "TASK_POSITION") {
    await api.post(
      "/api/task-positions/record_position/",
      {
        task: job.payload.taskId,
        client_event_id: job.payload.clientEventId,
        event_type: job.payload.eventType,
        latitude: job.payload.latitude,
        longitude: job.payload.longitude,
        accuracy_m: job.payload.accuracyM,
        original_occurred_at: job.payload.originalOccurredAt,
      },
      { silent: true },
    );
    return;
  }

  if (job.kind === "FIELD_TASK_TRANSITION") {
    await api.post(
      `/api/field-tasks/${job.payload.taskId}/transition_task/`,
      {
        status: job.payload.status,
        note: job.payload.note,
        latitude: job.payload.latitude,
        longitude: job.payload.longitude,
        accuracy_m: job.payload.accuracyM,
        original_occurred_at: job.payload.originalOccurredAt,
        client_event_id: job.payload.clientEventId,
      },
      { silent: true },
    );
    return;
  }

  if (job.kind === "MATERIAL_RECEIPT") {
    await createReceiptWithEvidence({
      receipt: job.payload.receipt,
      signature: restoreFile(job.payload.signature),
      supplierSignature: restoreFile(job.payload.supplierSignature),
      deliveryNotePhoto: job.payload.deliveryNotePhoto
        ? restoreFile(job.payload.deliveryNotePhoto)
        : undefined,
      sitePhotos: job.payload.sitePhotos.map(restoreFile),
      deviceId: job.payload.deviceId,
    });
    return;
  }

  if (job.kind === "EQUIPMENT_MOVEMENT") {
    await recordEquipmentMovement({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
      delivery_note_photo: job.payload.delivery_note_photo
        ? restoreFile(job.payload.delivery_note_photo)
        : undefined,
    });
    return;
  }

  if (job.kind === "SITE_PROGRESS") {
    await createSiteProgressRecord({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
    });
    return;
  }

  if (job.kind === "MATERIAL_OUTGOING") {
    await createMaterialOutgoing({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
    });
    return;
  }

  if (job.kind === "WASTE_OUTGOING") {
    await createWasteOutgoingRecord({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
    });
    return;
  }

  if (job.kind === "DISPOSAL_REQUEST") {
    await createDisposalRequest({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
    });
    return;
  }

  if (job.kind === "SAFETY_INCIDENT") {
    await createSafetyIncident({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
    });
    return;
  }

  if (job.kind === "CONSULTANT_SUBMISSION") {
    await createConsultantFieldSubmission({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
    });
    return;
  }

  if (job.kind === "CATEGORY_EVIDENCE") {
    await createCategoryFieldSubmission({
      ...job.payload,
      photos: job.payload.photos.map(restoreFile),
    });
    return;
  }

  if (job.kind === "DISPATCH_ACCEPT") {
    await api.post(
      `/api/dispatches/${job.payload.dispatchId}/accept_dispatch/`,
      {
        recycler_reference: job.payload.recyclerReference,
        proposed_collection_at: job.payload.proposedCollectionAt,
        proposed_collection_note: job.payload.proposedCollectionNote,
        client_event_id: job.payload.clientEventId,
      },
      { silent: true },
    );
    return;
  }

  if (job.kind === "DISPATCH_COLLECT") {
    await api.post(
      `/api/dispatches/${job.payload.dispatchId}/collect_dispatch/`,
      {
        recycler_reference: job.payload.recyclerReference,
        client_event_id: job.payload.clientEventId,
      },
      { silent: true },
    );
    return;
  }

  if (job.kind === "TRIP_ASSIGN") {
    await api.post(
      "/api/tasks/create_task/",
      {
        dispatch: job.payload.dispatchId || null,
        site: job.payload.site,
        vehicle: job.payload.vehicle,
        driver: job.payload.driver,
        scheduled_for: job.payload.scheduledFor,
        notes: job.payload.notes,
        client_event_id: job.payload.clientEventId,
      },
      { silent: true },
    );
    return;
  }

  const data = new FormData();
  data.append("image", restoreFile(job.payload.file));
  data.append("caption", job.payload.caption);
  data.append("captured_at", job.payload.capturedAt);
  data.append("client_event_id", job.payload.clientEventId);
  if (job.payload.latitude) data.append("latitude", job.payload.latitude);
  if (job.payload.longitude) data.append("longitude", job.payload.longitude);
  if (job.payload.accuracyM) data.append("accuracy_m", job.payload.accuracyM);
  if (job.payload.deviceId) data.append("device_id", job.payload.deviceId);
  await api.post(`/api/field-tasks/${job.payload.taskId}/add_photo/`, data, {
    silent: true,
  });
}

export async function submitAttendanceOfflineAware(
  ownerId: string,
  draft: AttendanceDraft,
): Promise<OfflineSubmission> {
  const now = new Date().toISOString();
  const job: Extract<OfflineJob, { kind: "ATTENDANCE" }> = {
    id: newId("attendance-job"),
    ownerId,
    kind: "ATTENDANCE",
    queuedAt: now,
    attempts: 0,
    lastError: "",
    payload: {
      project: draft.project,
      event: draft.event,
      note: draft.note ?? "",
      latitude: draft.latitude,
      longitude: draft.longitude,
      locationAccuracyM: draft.locationAccuracyM,
      originalOccurredAt: now,
      clientEventId: newId("attendance"),
      photo: draft.photo ? storeFile(draft.photo) : undefined,
    },
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      toastSuccess("attendance.toast.recorded");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

export async function submitTaskTransitionOfflineAware(
  ownerId: string,
  draft: TaskTransitionDraft,
): Promise<OfflineSubmission> {
  const now = new Date().toISOString();
  const job: Extract<OfflineJob, { kind: "TASK_TRANSITION" }> = {
    id: newId("task-transition-job"),
    ownerId,
    kind: "TASK_TRANSITION",
    queuedAt: now,
    attempts: 0,
    lastError: "",
    payload: {
      ...draft,
      originalOccurredAt: now,
      clientEventId: newId("task-transition"),
    },
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      await recordDriverTaskTransitionLocally(
        ownerId,
        draft.taskId,
        draft.state,
      ).catch(() => undefined);
      await cleanupSettledDriverSnapshots(ownerId).catch(() => undefined);
      toastSuccess("tasks.toast.advanced");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  const result = await enqueue(job);
  await recordDriverTaskTransitionLocally(
    ownerId,
    draft.taskId,
    draft.state,
  ).catch(() => undefined);
  return result;
}

export async function submitTaskPhotoOfflineAware(
  ownerId: string,
  taskId: string,
  file: File,
  kind = "LOADING",
  location: { latitude?: string; longitude?: string } = {},
): Promise<OfflineSubmission> {
  const now = new Date().toISOString();
  const job: Extract<OfflineJob, { kind: "TASK_PHOTO" }> = {
    id: newId("task-photo-job"),
    ownerId,
    kind: "TASK_PHOTO",
    queuedAt: now,
    attempts: 0,
    lastError: "",
    payload: {
      taskId,
      kind,
      originalOccurredAt: now,
      clientEventId: newId("task-photo"),
      latitude: location.latitude,
      longitude: location.longitude,
      file: storeFile(file),
    },
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      toastSuccess("driver.toast.photoSent");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  const result = await enqueue(job);
  await recordDriverTaskPhotoLocally(ownerId, taskId).catch(() => undefined);
  return result;
}

export async function submitTaskPositionOfflineAware(
  ownerId: string,
  draft: TaskPositionDraft,
): Promise<OfflineSubmission> {
  const occurredAt = draft.originalOccurredAt ?? new Date().toISOString();
  const job: Extract<OfflineJob, { kind: "TASK_POSITION" }> = {
    id: newId("task-position-job"),
    ownerId,
    kind: "TASK_POSITION",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: {
      taskId: draft.taskId,
      eventType: draft.eventType ?? "POSITION",
      latitude: draft.latitude,
      longitude: draft.longitude,
      accuracyM: draft.accuracyM,
      originalOccurredAt: occurredAt,
      clientEventId: newId("task-position"),
    },
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

export async function submitFieldTaskTransitionOfflineAware(
  ownerId: string,
  taskId: string,
  status: "IN_PROGRESS" | "SUBMITTED",
  location?: { latitude: string; longitude: string; accuracyM: string },
  note = "",
): Promise<OfflineSubmission> {
  const now = new Date().toISOString();
  const job: Extract<OfflineJob, { kind: "FIELD_TASK_TRANSITION" }> = {
    id: newId("field-task-transition-job"),
    ownerId,
    kind: "FIELD_TASK_TRANSITION",
    queuedAt: now,
    attempts: 0,
    lastError: "",
    payload: {
      taskId,
      status,
      note,
      latitude: location?.latitude,
      longitude: location?.longitude,
      accuracyM: location?.accuracyM,
      originalOccurredAt: now,
      clientEventId: newId("field-task-transition"),
    },
  };
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      toastSuccess("contractorOps.toast.taskUpdated");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

export async function submitFieldTaskPhotoOfflineAware(
  ownerId: string,
  draft: FieldTaskPhotoDraft,
): Promise<OfflineSubmission> {
  const now = new Date().toISOString();
  const job: Extract<OfflineJob, { kind: "FIELD_TASK_PHOTO" }> = {
    id: newId("field-task-photo-job"),
    ownerId,
    kind: "FIELD_TASK_PHOTO",
    queuedAt: now,
    attempts: 0,
    lastError: "",
    payload: {
      taskId: draft.taskId,
      caption: draft.caption ?? "",
      capturedAt: now,
      latitude: draft.latitude,
      longitude: draft.longitude,
      accuracyM: draft.accuracyM,
      deviceId: draft.deviceId,
      clientEventId: newId("field-task-photo"),
      file: storeFile(draft.file),
    },
  };
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      toastSuccess("contractorOps.toast.photoAdded");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

export async function submitMaterialReceiptOfflineAware(
  ownerId: string,
  draft: MaterialReceiptDraft,
): Promise<OfflineSubmission> {
  const job: Extract<OfflineJob, { kind: "MATERIAL_RECEIPT" }> = {
    id: newId("material-receipt-job"),
    ownerId,
    kind: "MATERIAL_RECEIPT",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: {
      receipt: draft.receipt,
      signature: storeFile(draft.signature),
      supplierSignature: storeFile(draft.supplierSignature),
      deliveryNotePhoto: draft.deliveryNotePhoto
        ? storeFile(draft.deliveryNotePhoto)
        : undefined,
      sitePhotos: draft.sitePhotos.map(storeFile),
      deviceId: draft.deviceId,
    },
  };
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

async function submitCaptureJob(
  job: Extract<
    OfflineJob,
    {
      kind:
        | "EQUIPMENT_MOVEMENT"
        | "SITE_PROGRESS"
        | "MATERIAL_OUTGOING"
        | "WASTE_OUTGOING"
        | "DISPOSAL_REQUEST"
        | "SAFETY_INCIDENT"
        | "CONSULTANT_SUBMISSION"
        | "CATEGORY_EVIDENCE";
    }
  >,
): Promise<OfflineSubmission> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

export function submitEquipmentMovementOfflineAware(
  ownerId: string,
  draft: Omit<
    Extract<OfflineJob, { kind: "EQUIPMENT_MOVEMENT" }>["payload"],
    "photos" | "delivery_note_photo"
  > & { photos: File[]; delivery_note_photo?: File },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("equipment-movement-job"),
    ownerId,
    kind: "EQUIPMENT_MOVEMENT",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: {
      ...draft,
      photos: draft.photos.map(storeFile),
      delivery_note_photo: draft.delivery_note_photo
        ? storeFile(draft.delivery_note_photo)
        : undefined,
    },
  });
}

export function submitSiteProgressOfflineAware(
  ownerId: string,
  draft: Omit<
    Extract<OfflineJob, { kind: "SITE_PROGRESS" }>["payload"],
    "photos"
  > & { photos: File[] },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("site-progress-job"),
    ownerId,
    kind: "SITE_PROGRESS",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: { ...draft, photos: draft.photos.map(storeFile) },
  });
}

export function submitMaterialOutgoingOfflineAware(
  ownerId: string,
  draft: Omit<
    Extract<OfflineJob, { kind: "MATERIAL_OUTGOING" }>["payload"],
    "photos"
  > & { photos: File[] },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("material-outgoing-job"),
    ownerId,
    kind: "MATERIAL_OUTGOING",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: { ...draft, photos: draft.photos.map(storeFile) },
  });
}

/**
 * Automatic GPS samples, sent as one batch.
 *
 * Deliberately not stamped with an offline creation time. That stamp exists to
 * separate "recorded on the spot, uploaded late" from "typed in hours after the
 * fact", and a GPS fix has no such gap: nobody back-fills a position, so its
 * occurrence time *is* its creation time and `original_occurred_at` already
 * carries it.
 */
async function uploadPositionBatch(
  jobs: Extract<OfflineJob, { kind: "TASK_POSITION" }>[],
): Promise<void> {
  if (jobs.length === 0) return;
  await api.post(
    "/api/task-positions/record_positions/",
    {
      task: jobs[0].payload.taskId,
      positions: jobs.map((job) => ({
        client_event_id: job.payload.clientEventId,
        event_type: job.payload.eventType,
        latitude: job.payload.latitude,
        longitude: job.payload.longitude,
        accuracy_m: job.payload.accuracyM,
        original_occurred_at: job.payload.originalOccurredAt,
      })),
    },
    { silent: true },
  );
}

export function submitWasteOutgoingOfflineAware(
  ownerId: string,
  draft: Omit<
    Extract<OfflineJob, { kind: "WASTE_OUTGOING" }>["payload"],
    "photos"
  > & { photos: File[] },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("waste-outgoing-job"),
    ownerId,
    kind: "WASTE_OUTGOING",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: { ...draft, photos: draft.photos.map(storeFile) },
  });
}

export function submitDisposalRequestOfflineAware(
  ownerId: string,
  draft: Omit<
    Extract<OfflineJob, { kind: "DISPOSAL_REQUEST" }>["payload"],
    "photos"
  > & { photos: File[] },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("disposal-request-job"),
    ownerId,
    kind: "DISPOSAL_REQUEST",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: { ...draft, photos: draft.photos.map(storeFile) },
  });
}

export function submitSafetyIncidentOfflineAware(
  ownerId: string,
  draft: SafetyIncidentPayload & { client_event_id: string },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("safety-incident-job"),
    ownerId,
    kind: "SAFETY_INCIDENT",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: {
      ...draft,
      photos: (draft.photos ?? []).map(storeFile),
    },
  });
}

export function submitConsultantSubmissionOfflineAware(
  ownerId: string,
  draft: Omit<
    Extract<OfflineJob, { kind: "CONSULTANT_SUBMISSION" }>["payload"],
    "photos"
  > & { photos: File[] },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("consultant-submission-job"),
    ownerId,
    kind: "CONSULTANT_SUBMISSION",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: { ...draft, photos: draft.photos.map(storeFile) },
  });
}

export function submitCategoryEvidenceOfflineAware(
  ownerId: string,
  draft: Omit<
    Extract<OfflineJob, { kind: "CATEGORY_EVIDENCE" }>["payload"],
    "photos"
  > & { photos: File[] },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("category-evidence-job"),
    ownerId,
    kind: "CATEGORY_EVIDENCE",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: { ...draft, photos: draft.photos.map(storeFile) },
  });
}

interface DispatchAcceptDraft {
  dispatchId: string;
  dispatchNo: string;
  recyclerReference: string;
  proposedCollectionAt: string;
  proposedCollectionNote?: string;
}

interface DispatchCollectDraft {
  dispatchId: string;
  dispatchNo: string;
  recyclerReference: string;
}

interface TripAssignDraft {
  dispatchId: string;
  dispatchNo: string;
  site: string;
  vehicle: string;
  driver: string;
  scheduledFor?: string | null;
  notes?: string;
}

export async function submitDispatchAcceptOfflineAware(
  ownerId: string,
  draft: DispatchAcceptDraft,
): Promise<OfflineSubmission> {
  const job: Extract<OfflineJob, { kind: "DISPATCH_ACCEPT" }> = {
    id: newId("dispatch-accept-job"),
    ownerId,
    kind: "DISPATCH_ACCEPT",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: {
      dispatchId: draft.dispatchId,
      dispatchNo: draft.dispatchNo,
      recyclerReference: draft.recyclerReference,
      proposedCollectionAt: draft.proposedCollectionAt,
      proposedCollectionNote: draft.proposedCollectionNote ?? "",
      clientEventId: newId("dispatch-accept"),
    },
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      toastSuccess("incoming.toast.accepted");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

export async function submitDispatchCollectOfflineAware(
  ownerId: string,
  draft: DispatchCollectDraft,
): Promise<OfflineSubmission> {
  const job: Extract<OfflineJob, { kind: "DISPATCH_COLLECT" }> = {
    id: newId("dispatch-collect-job"),
    ownerId,
    kind: "DISPATCH_COLLECT",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: {
      dispatchId: draft.dispatchId,
      dispatchNo: draft.dispatchNo,
      recyclerReference: draft.recyclerReference,
      clientEventId: newId("dispatch-collect"),
    },
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await uploadJob(job);
      toastSuccess("incoming.toast.collected");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

function buildTripAssignJob(
  ownerId: string,
  draft: TripAssignDraft,
): Extract<OfflineJob, { kind: "TRIP_ASSIGN" }> {
  return {
    id: newId("trip-assign-job"),
    ownerId,
    kind: "TRIP_ASSIGN",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: {
      dispatchId: draft.dispatchId,
      dispatchNo: draft.dispatchNo,
      site: draft.site,
      vehicle: draft.vehicle,
      driver: draft.driver,
      scheduledFor: draft.scheduledFor ?? null,
      notes: draft.notes ?? "",
      clientEventId: newId("trip-assign"),
    },
  };
}

/** Queue an assignment without trying the network first — for callers that
 * already saw the network fail and have their own online path. */
export function enqueueTripAssign(
  ownerId: string,
  draft: TripAssignDraft,
): Promise<OfflineSubmission> {
  return enqueue(buildTripAssignJob(ownerId, draft));
}

/** What the queue holds, shaped for the status popover — no blobs attached. */
export interface OfflineQueueEntry {
  id: string;
  kind: OfflineJob["kind"];
  reference: string;
  queuedAt: string;
  attempts: number;
  lastError: string;
}

function jobReference(job: OfflineJob): string {
  const payload = job.payload as { dispatchNo?: string; taskId?: string };
  return payload.dispatchNo ?? payload.taskId ?? "";
}

export async function getOfflineQueueEntries(
  ownerId: string,
): Promise<OfflineQueueEntry[]> {
  const jobs = await getOfflineJobs(ownerId);
  return jobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    reference: jobReference(job),
    queuedAt: job.queuedAt,
    attempts: job.attempts,
    lastError: job.lastError,
  }));
}

/**
 * Drop one queued action the user has decided not to send.
 *
 * Only the user drops jobs — sync never discards silently, because a queued
 * action is a record of work someone did on the yard floor.
 */
export async function discardOfflineJob(id: string): Promise<void> {
  await deleteOfflineJob(id);
  notifyQueueChanged();
}

export async function flushOfflineJobs(ownerId: string): Promise<{
  synced: number;
  remaining: number;
}> {
  const jobs = await getOfflineJobs(ownerId);
  let synced = 0;

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const positions: Extract<OfflineJob, { kind: "TASK_POSITION" }>[] = [];
    if (job.kind === "TASK_POSITION") {
      for (
        let cursor = index;
        cursor < jobs.length && positions.length < 200;
        cursor += 1
      ) {
        const candidate = jobs[cursor];
        if (
          candidate.kind !== "TASK_POSITION" ||
          candidate.payload.taskId !== job.payload.taskId
        ) {
          break;
        }
        positions.push(candidate);
      }
    }
    try {
      if (positions.length > 0) {
        await uploadPositionBatch(positions);
        await Promise.all(
          positions.map((position) => deleteOfflineJob(position.id)),
        );
        synced += positions.length;
      } else {
        await uploadJob(job);
        await deleteOfflineJob(job.id);
        synced += 1;
      }
    } catch (error) {
      if (
        isNetworkFailure(error) ||
        (error instanceof ApiError && error.isUnauthorized)
      ) {
        break;
      }
      const failedJobs: OfflineJob[] = positions.length > 0 ? positions : [job];
      await Promise.all(
        failedJobs.map((failedJob) =>
          putOfflineJob({
            ...failedJob,
            attempts: failedJob.attempts + 1,
            lastError: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
    }
    index += Math.max(positions.length - 1, 0);
  }

  const remaining = await countOfflineJobs(ownerId);
  await cleanupSettledDriverSnapshots(ownerId).catch(() => undefined);
  notifyQueueChanged();
  if (synced > 0) toastSuccess("offline.synced", { count: synced });
  return { synced, remaining };
}

export async function getOfflineQueueSummary(ownerId: string): Promise<{
  pending: number;
  failed: number;
}> {
  const jobs = await getOfflineJobs(ownerId);
  return {
    pending: jobs.length,
    failed: jobs.filter((job) => job.attempts > 0).length,
  };
}

export { countOfflineJobs };
