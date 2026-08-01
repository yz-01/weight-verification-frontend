/** Attendance, progress and safety records, all scoped through a project. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  AttendancePayload,
  AttendanceRecord,
  IncidentStatus,
  ProgressPayload,
  ProgressUpdate,
  SafetyIncident,
  SafetyIncidentPayload,
} from "@/interfaces/site-operations";
import { api, toastSuccess } from "@/services/api-client";

function multipart(payload: Record<string, unknown>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    data.append(key, value instanceof File ? value : String(value));
  }
  return data;
}

export function getAttendance(
  query: ListQuery,
): Promise<Paginated<AttendanceRecord>> {
  return api.list<AttendanceRecord>("/api/attendance/get_attendance/", query);
}

export async function clockAttendance(
  payload: AttendancePayload,
): Promise<AttendanceRecord> {
  const record = await api.post<AttendanceRecord>(
    "/api/attendance/clock/",
    multipart(payload as unknown as Record<string, unknown>),
  );
  toastSuccess("attendance.toast.recorded");
  return record;
}

export function getProgressUpdates(
  query: ListQuery,
): Promise<Paginated<ProgressUpdate>> {
  return api.list<ProgressUpdate>(
    "/api/progress-updates/get_progress_updates/",
    query,
  );
}

export function getProgressUpdate(id: string): Promise<ProgressUpdate> {
  return api.get<ProgressUpdate>(
    `/api/progress-updates/${id}/get_progress_update/`,
  );
}

export async function createProgressUpdate(
  payload: ProgressPayload,
): Promise<ProgressUpdate> {
  const update = await api.post<ProgressUpdate>(
    "/api/progress-updates/create_progress_update/",
    multipart(payload as unknown as Record<string, unknown>),
  );
  toastSuccess("progress.toast.created");
  return update;
}

export async function updateProgressUpdate(
  id: string,
  payload: Partial<ProgressPayload>,
): Promise<ProgressUpdate> {
  const update = await api.patch<ProgressUpdate>(
    `/api/progress-updates/${id}/update_progress_update/`,
    multipart(payload as unknown as Record<string, unknown>),
  );
  toastSuccess("progress.toast.updated");
  return update;
}

export async function deleteProgressUpdate(id: string): Promise<void> {
  await api.delete(`/api/progress-updates/${id}/delete_progress_update/`);
  toastSuccess("progress.toast.removed");
}

export function getSafetyIncidents(
  query: ListQuery,
): Promise<Paginated<SafetyIncident>> {
  return api.list<SafetyIncident>(
    "/api/safety-incidents/get_safety_incidents/",
    query,
  );
}

export async function createSafetyIncident(
  payload: SafetyIncidentPayload,
): Promise<SafetyIncident> {
  const incident = await api.post<SafetyIncident>(
    "/api/safety-incidents/create_safety_incident/",
    multipart(payload as unknown as Record<string, unknown>),
  );
  toastSuccess("safety.toast.created");
  return incident;
}

export async function updateSafetyStatus(
  id: string,
  status: IncidentStatus,
  resolutionNote: string,
): Promise<SafetyIncident> {
  const incident = await api.post<SafetyIncident>(
    `/api/safety-incidents/${id}/update_safety_status/`,
    { status, resolution_note: resolutionNote },
  );
  toastSuccess("safety.toast.updated");
  return incident;
}
