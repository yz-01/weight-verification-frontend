import { ApiError } from "@/interfaces/api";
import type { AttendanceEvent } from "@/interfaces/site-operations";
import type { SafetyIncidentPayload } from "@/interfaces/site-operations";
import type { MaterialReceiptPayload } from "@/interfaces/contractor";
import type { SafetyIncident } from "@/interfaces/site-operations";
import type { TaskPositionEvent, TaskState } from "@/interfaces/recycler";
import {
  countOfflineJobs,
  deleteOfflineJob,
  getOfflineJobs,
  type OfflineJob,
  putOfflineJob,
  restoreFile,
  type StoredFile,
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
import { createSundryClaim } from "@/services/sundry-claim.service";
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
  signature?: File;
  supplierSignature?: File;
  deliveryNotePhoto?: File;
  sitePhotos: File[];
  deviceId: string;
}

export type OfflineSubmission = "uploaded" | "queued";

export type SafetyIncidentSubmission =
  | { status: "uploaded"; incident: SafetyIncident }
  | { status: "queued" };

function newId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

/**
 * One id for one press, shared by the online attempt and the queued retry.
 *
 * A request that reached the server and lost its answer on the way back looks
 * like a dead network. If the queue then minted its own id, the replay would
 * be a second trip, not the same one (F-463).
 */
export function newClientEventId(prefix: string): string {
  return newId(prefix);
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

/**
 * Jobs this tab has queued in the last few minutes, so the 挂号 (pending
 * slot, D-259) that submitted one can claim it and keep showing 「等待上传」
 * until that exact job has really been uploaded.
 *
 * Recorded here rather than returned from every `submit*OfflineAware`,
 * because those return `"uploaded" | "queued"` to twenty callers and the slot
 * is the only one that needs the id.
 */
const recentlyQueued: Array<{ id: string; kind: OfflineJob["kind"]; at: number }> = [];

/** The newest unclaimed job of one of these kinds queued in the last two minutes. */
export function claimQueuedJob(kinds: readonly OfflineJob["kind"][]): string | null {
  const cutoff = Date.now() - 120_000;
  for (let index = recentlyQueued.length - 1; index >= 0; index -= 1) {
    const entry = recentlyQueued[index];
    if (entry.at < cutoff) break;
    if (kinds.includes(entry.kind)) {
      recentlyQueued.splice(index, 1);
      return entry.id;
    }
  }
  return null;
}

/** Whether a queued job is still waiting, and why it last failed if it did. */
export async function queuedJobState(
  ownerId: string,
  id: string,
): Promise<{ waiting: boolean; attempts: number; lastError: string }> {
  const job = (await getOfflineJobs(ownerId)).find((entry) => entry.id === id);
  return job
    ? { waiting: true, attempts: job.attempts, lastError: job.lastError }
    : { waiting: false, attempts: 0, lastError: "" };
}

async function enqueue(job: OfflineJob): Promise<OfflineSubmission> {
  recentlyQueued.push({ id: job.id, kind: job.kind, at: Date.now() });
  if (recentlyQueued.length > 50) recentlyQueued.shift();
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
      // Older queued jobs remain recoverable; the API reports a missing column.
      receipt: { ...job.payload.receipt, category: job.payload.receipt.category ?? "" },
      signature: job.payload.signature ? restoreFile(job.payload.signature) : undefined,
      supplierSignature: job.payload.supplierSignature ? restoreFile(job.payload.supplierSignature) : undefined,
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

  if (job.kind === "SUNDRY_CLAIM") {
    await createSundryClaim({
      ...job.payload,
      attachments: job.payload.attachments.map(restoreFile),
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
  await recordDriverTaskPhotoLocally(ownerId, taskId, kind).catch(
    () => undefined,
  );
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
      signature: draft.signature ? storeFile(draft.signature) : undefined,
      supplierSignature: draft.supplierSignature ? storeFile(draft.supplierSignature) : undefined,
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
        | "SUNDRY_CLAIM"
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

export function submitSundryClaimOfflineAware(
  ownerId: string,
  draft: Omit<Extract<OfflineJob, { kind: "SUNDRY_CLAIM" }>["payload"], "attachments"> & {
    attachments: File[];
  },
): Promise<OfflineSubmission> {
  return submitCaptureJob({
    id: newId("sundry-claim-job"),
    ownerId,
    kind: "SUNDRY_CLAIM",
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    payload: { ...draft, attachments: draft.attachments.map(storeFile) },
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

export async function submitSafetyIncidentOfflineAware(
  ownerId: string,
  draft: SafetyIncidentPayload & { client_event_id: string },
): Promise<SafetyIncidentSubmission> {
  const job: Extract<OfflineJob, { kind: "SAFETY_INCIDENT" }> = {
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
  };
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const incident = await withOfflineProvenance(job.queuedAt, () =>
        createSafetyIncident(draft),
      );
      return { status: "uploaded", incident };
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  await enqueue(job);
  return { status: "queued" };
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
  /** The id the online attempt already used, when there was one. */
  clientEventId?: string;
}

/** The order a recycler action belongs to, or null for every other kind. */
function dispatchOf(job: OfflineJob): string | null {
  if (
    job.kind === "DISPATCH_ACCEPT" ||
    job.kind === "DISPATCH_COLLECT" ||
    job.kind === "TRIP_ASSIGN"
  ) {
    return job.payload.dispatchId || null;
  }
  return null;
}

/** Whether a waiting job already does what this one would. */
function sameAction(waiting: OfflineJob, job: OfflineJob): boolean {
  if (waiting.kind !== job.kind || waiting.ownerId !== job.ownerId) return false;
  if (waiting.kind === "TRIP_ASSIGN" && job.kind === "TRIP_ASSIGN") {
    if (waiting.payload.dispatchId || job.payload.dispatchId) {
      return waiting.payload.dispatchId === job.payload.dispatchId;
    }
    // A trip with no order behind it is the same trip when it is the same
    // lorry, driver, yard and time.
    return (
      waiting.payload.site === job.payload.site &&
      waiting.payload.vehicle === job.payload.vehicle &&
      waiting.payload.driver === job.payload.driver &&
      waiting.payload.scheduledFor === job.payload.scheduledFor
    );
  }
  const order = dispatchOf(job);
  return order !== null && order === dispatchOf(waiting);
}

/**
 * A second press of the same button folds into the job already waiting.
 *
 * Each press used to mint its own `client_event_id`, so accepting one order
 * twice while offline queued two acceptances; the server refused the second
 * and the yard saw a failure it had not caused (F-463). The first job is the
 * one that will be sent - also when the network is back, so an online press
 * does not race the queue with a new id.
 */
async function alreadyWaiting(job: OfflineJob): Promise<boolean> {
  try {
    const waiting = await getOfflineJobs(job.ownerId);
    if (!waiting.some((other) => sameAction(other, job))) return false;
  } catch {
    // No IndexedDB (private browsing): nothing can be waiting in it.
    return false;
  }
  toastSuccess("offline.alreadyQueued");
  return true;
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

  if (await alreadyWaiting(job)) return "queued";
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

  if (await alreadyWaiting(job)) return "queued";
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
      clientEventId: draft.clientEventId ?? newId("trip-assign"),
    },
  };
}

/** Queue an assignment without trying the network first — for callers that
 * already saw the network fail and have their own online path. */
export async function enqueueTripAssign(
  ownerId: string,
  draft: TripAssignDraft,
): Promise<OfflineSubmission> {
  const job = buildTripAssignJob(ownerId, draft);
  if (await alreadyWaiting(job)) return "queued";
  return enqueue(job);
}

/**
 * Where one queued action stands (AC-049: 待同步 / 同步中 / 成功 / 失败原因).
 *
 * `held` is the dependency rule made visible: an earlier step for the same
 * order failed, so this one is not sent until that is dealt with.
 */
export type OfflineQueueState = "waiting" | "syncing" | "failed" | "held";

/** What the queue holds, shaped for the status popover — no blobs attached. */
export interface OfflineQueueEntry {
  id: string;
  kind: OfflineJob["kind"];
  reference: string;
  queuedAt: string;
  attempts: number;
  lastError: string;
  state: OfflineQueueState;
  /** A message key saying, in plain words, what the refusal means. */
  hint: string | null;
}

/** An action that reached the server during this session. */
export interface SyncedQueueEntry {
  id: string;
  ownerId: string;
  kind: OfflineJob["kind"];
  reference: string;
  syncedAt: string;
}

let syncingJobId: string | null = null;
const recentlySynced: SyncedQueueEntry[] = [];

function setSyncing(id: string | null): void {
  syncingJobId = id;
  notifyQueueChanged();
}

function recordSynced(job: OfflineJob): void {
  recentlySynced.unshift({
    id: job.id,
    ownerId: job.ownerId,
    kind: job.kind,
    reference: jobReference(job),
    syncedAt: new Date().toISOString(),
  });
  if (recentlySynced.length > 20) recentlySynced.length = 20;
}

/** The actions synced since this page loaded, newest first. */
export function getRecentlySynced(ownerId: string): SyncedQueueEntry[] {
  return recentlySynced.filter((entry) => entry.ownerId === ownerId);
}

/**
 * What a refusal means for someone who did the work offline (AC-050).
 *
 * The server's own sentence says what is wrong with the request now; it
 * cannot say that the reason is something that happened while this device was
 * away. These do, and say what to do next. Generic over every job kind: a
 * lost permission means the same thing on a receipt as on a trip.
 */
export function conflictHint(status?: number, code?: string): string | null {
  if (!status) return null;
  if (status === 403) return "offline.conflict.forbidden";
  if (status === 404) return "offline.conflict.gone";
  if (status === 409 && code === "task_already_running") {
    return "offline.conflict.alreadyAssigned";
  }
  if (status === 409) return "offline.conflict.changed";
  if (status === 400) return "offline.conflict.invalid";
  return "offline.conflict.server";
}

function jobReference(job: OfflineJob): string {
  const payload = job.payload as { dispatchNo?: string; taskId?: string };
  return payload.dispatchNo ?? payload.taskId ?? "";
}

export async function getOfflineQueueEntries(
  ownerId: string,
): Promise<OfflineQueueEntry[]> {
  const jobs = await getOfflineJobs(ownerId);
  const failedOrders = new Set<string>();
  return jobs.map((job) => {
    const order = dispatchOf(job);
    const state: OfflineQueueState =
      job.id === syncingJobId
        ? "syncing"
        : order && failedOrders.has(order)
          ? "held"
          : job.attempts > 0
            ? "failed"
            : "waiting";
    if (order && (state === "failed" || state === "held")) failedOrders.add(order);
    return {
      id: job.id,
      kind: job.kind,
      reference: jobReference(job),
      queuedAt: job.queuedAt,
      attempts: job.attempts,
      lastError: job.lastError,
      state,
      hint:
        state === "failed"
          ? conflictHint(job.lastErrorStatus, job.lastErrorCode)
          : null,
    };
  });
}

/**
 * Which payload keys a queued entry may show, and the label each maps to.
 *
 * An allow-list, not a walk of everything: a payload also holds project and
 * category *ids*, device ids and coordinates, and a worker reading a UUID
 * where "Mixed waste" belongs learns nothing. Every value on the right is a
 * key the catalogue already has (`mySubmissions.field.*`, checked against all
 * four languages by `core.tests.test_submission_labels`), so nothing here can
 * render as a key path.
 *
 * `severity` is deliberately absent: it is stored as `HIGH`, and a raw code on
 * screen is the defect F-225 recorded.
 */
const QUEUED_FIELD_LABELS: Record<string, string> = {
  material_name: "material_name",
  material_specification: "specification",
  quantity: "quantity",
  vehicle_plate: "vehicle_plate",
  delivery_note_no: "delivery_note_no",
  received_by_name: "received_by_name",
  notes: "note",
  note: "note",
  title: "title",
  description: "description",
  percent_complete: "percent_complete",
  pickup_address: "pickup_address",
  work_location: "work_location",
  instructions: "instructions",
};

/** What a queued submission looks like when opened, read off this phone. */
export interface QueuedSubmissionDetail {
  kind: OfflineJob["kind"];
  queuedAt: string;
  attempts: number;
  /** The server's own refusal, stored since F-230 and now shown. */
  lastError: string;
  fields: { key: string; value: string; unit?: string }[];
  /** The photographs as taken - still on the phone, never uploaded. */
  photos: Blob[];
}

function isStoredFile(value: unknown): value is StoredFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "blob" in value &&
    (value as { blob: unknown }).blob instanceof Blob
  );
}

/**
 * What a queued payload has to show, pulled out of the shape it is stored in.
 *
 * Separate from the IndexedDB read on purpose: this is the part that can be
 * wrong - which keys surface, which stay hidden, whether a quantity keeps its
 * unit - and it is the part a test can reach. The repository has no IndexedDB
 * test environment and this was not worth adding a dependency for, so the
 * seam moved instead.
 *
 * Two levels deep because a receipt nests its own fields under
 * `payload.receipt` while every other kind is flat; a third level would start
 * reaching into things that are not this screen's business.
 */
export function summariseQueuedPayload(payload: unknown): {
  fields: QueuedSubmissionDetail["fields"];
  photos: Blob[];
} {
  const fields: QueuedSubmissionDetail["fields"] = [];
  const photos: Blob[] = [];
  const units: Record<string, string> = {};

  const visit = (node: Record<string, unknown>, depth: number) => {
    for (const [key, value] of Object.entries(node)) {
      if (isStoredFile(value)) {
        photos.push(value.blob);
      } else if (Array.isArray(value)) {
        for (const item of value) if (isStoredFile(item)) photos.push(item.blob);
      } else if (typeof value === "object" && value !== null && depth < 2) {
        visit(value as Record<string, unknown>, depth + 1);
      } else if (key === "unit" && typeof value === "string" && value) {
        units.quantity = value;
      } else if (
        QUEUED_FIELD_LABELS[key] &&
        (typeof value === "string" || typeof value === "number") &&
        String(value).trim()
      ) {
        fields.push({
          key: QUEUED_FIELD_LABELS[key],
          value: String(value).trim(),
        });
      }
    }
  };
  if (typeof payload === "object" && payload !== null) {
    visit(payload as Record<string, unknown>, 0);
  }

  for (const field of fields) {
    if (units[field.key]) field.unit = units[field.key];
  }
  return { fields, photos };
}

/**
 * One queued submission, opened (T-210).
 *
 * The list shape deliberately carries no blobs, so this reads the job again
 * rather than widening that.
 *
 * Returns null when the job has already gone out, which is the common race:
 * the worker taps a row at the moment sync drains it.
 */
export async function getQueuedSubmissionDetail(
  ownerId: string,
  jobId: string,
): Promise<QueuedSubmissionDetail | null> {
  const job = (await getOfflineJobs(ownerId)).find((row) => row.id === jobId);
  if (!job) return null;

  const { fields, photos } = summariseQueuedPayload(job.payload);
  return {
    kind: job.kind,
    queuedAt: job.queuedAt,
    attempts: job.attempts,
    lastError: job.lastError,
    fields,
    photos,
  };
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
  // Orders whose earlier step was refused in this pass. Their later steps
  // wait: collecting a load whose acceptance failed, or rostering a trip for
  // it, would act on an order in a state nobody on the yard has seen (F-463).
  const heldOrders = new Set<string>();

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const order = dispatchOf(job);
    if (order && heldOrders.has(order)) continue;
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
    setSyncing(job.id);
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
        recordSynced(job);
        synced += 1;
      }
    } catch (error) {
      if (
        isNetworkFailure(error) ||
        (error instanceof ApiError && error.isUnauthorized)
      ) {
        setSyncing(null);
        break;
      }
      if (order) heldOrders.add(order);
      const failedJobs: OfflineJob[] = positions.length > 0 ? positions : [job];
      await Promise.all(
        failedJobs.map((failedJob) =>
          putOfflineJob({
            ...failedJob,
            attempts: failedJob.attempts + 1,
            lastError: error instanceof Error ? error.message : String(error),
            lastErrorStatus: error instanceof ApiError ? error.status : undefined,
            lastErrorCode: error instanceof ApiError ? error.code : undefined,
          }),
        ),
      );
    }
    setSyncing(null);
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
