import { ApiError } from "@/interfaces/api";
import type { AttendanceEvent } from "@/interfaces/site-operations";
import {
  countOfflineJobs,
  deleteOfflineJob,
  getOfflineJobs,
  type OfflineJob,
  putOfflineJob,
  restoreFile,
  storeFile,
} from "@/lib/offline-db";
import { api, toastSuccess } from "@/services/api-client";

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
  state: string;
  latitude?: string;
  longitude?: string;
  notes?: string;
  reason?: string;
}

interface TaskPositionDraft {
  taskId: string;
  eventType?: "POSITION" | "ARRIVAL" | "GEOFENCE_ENTER" | "GEOFENCE_EXIT";
  latitude: string;
  longitude: string;
  accuracyM?: string;
  originalOccurredAt?: string;
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
    const registration = await navigator.serviceWorker.ready;
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

function appendAttendance(data: FormData, job: Extract<OfflineJob, { kind: "ATTENDANCE" }>) {
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

async function uploadJob(job: OfflineJob): Promise<void> {
  if (job.kind === "ATTENDANCE") {
    const data = new FormData();
    appendAttendance(data, job);
    await api.post("/api/attendance/clock/", data, { silent: true });
    return;
  }

  if (job.kind === "TASK_TRANSITION") {
    const { taskId, originalOccurredAt, clientEventId, ...payload } = job.payload;
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
    await api.post(`/api/tasks/${job.payload.taskId}/add_photo/`, data, {
      silent: true,
    });
    return;
  }

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
      toastSuccess("tasks.toast.advanced");
      return "uploaded";
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }
  return enqueue(job);
}

export async function submitTaskPhotoOfflineAware(
  ownerId: string,
  taskId: string,
  file: File,
  kind = "LOADING",
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
  return enqueue(job);
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

export async function flushOfflineJobs(ownerId: string): Promise<{
  synced: number;
  remaining: number;
}> {
  const jobs = await getOfflineJobs(ownerId);
  let synced = 0;

  for (const job of jobs) {
    try {
      await uploadJob(job);
      await deleteOfflineJob(job.id);
      synced += 1;
    } catch (error) {
      if (isNetworkFailure(error) || (error instanceof ApiError && error.isUnauthorized)) {
        break;
      }
      await putOfflineJob({
        ...job,
        attempts: job.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const remaining = await countOfflineJobs(ownerId);
  notifyQueueChanged();
  if (synced > 0) toastSuccess("offline.synced", { count: synced });
  return { synced, remaining };
}

export { countOfflineJobs };
