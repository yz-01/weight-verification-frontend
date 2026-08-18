/** Attendance, progress and safety records, all scoped through a project. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { ExportRequest } from "@/services/contractor.service";
import type {
  AttendancePayload,
  AttendanceRecord,
  IncidentStatus,
  ProgressPayload,
  ProgressUpdate,
  SafetyIncident,
  SafetyIncidentPayload,
} from "@/interfaces/site-operations";
import type {
  IncidentReportThread,
  IncidentReportThreadPayload,
  IncidentReportMessage,
  IncidentReportMessagePayload,
  IncidentReportRecipient,
  IncidentReportThreadDetail,
} from "@/interfaces/incident-report";
import { api, download, toastSuccess } from "@/services/api-client";

function multipart(payload: Record<string, unknown>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) =>
        data.append(key, item instanceof File ? item : String(item)),
      );
    } else {
      data.append(key, value instanceof File ? value : String(value));
    }
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

export function getSafetyIncident(id: string): Promise<SafetyIncident> {
  return api.get<SafetyIncident>(
    `/api/safety-incidents/${id}/get_safety_incident/`,
  );
}

export function exportSafetyIncidents(request: ExportRequest): Promise<void> {
  const { page, page_size, ...query } = request.query;
  void page;
  void page_size;
  return download("/api/safety-incidents/export_safety_incidents/", {
    method: "POST",
    query,
    body: {
      format: request.format,
      title: request.title,
      subtitle: request.subtitle ?? "",
      empty_label: request.emptyLabel ?? "",
      columns: request.columns,
    },
    fallbackFilename: `safety-incidents.${request.format}`,
  });
}

export async function createSafetyIncident(
  payload: SafetyIncidentPayload,
): Promise<SafetyIncident> {
  const data = multipart(payload as unknown as Record<string, unknown>);
  const incident = await api.post<SafetyIncident>(
    "/api/safety-incidents/create_safety_incident/",
    data,
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

export async function assignSafetyRectification(
  id: string,
  payload: { responsible_person: string; due_at: string; note?: string },
): Promise<SafetyIncident> {
  const incident = await api.post<SafetyIncident>(
    `/api/safety-incidents/${id}/assign_rectification/`,
    payload,
  );
  toastSuccess("safetyRectification.toast.assigned");
  return incident;
}

export async function submitSafetyRectification(
  id: string,
  payload: {
    images: File[];
    note: string;
    captured_at: string;
    latitude?: string;
    longitude?: string;
    accuracy_m?: string;
    device_id?: string;
    client_event_id: string;
  },
): Promise<SafetyIncident> {
  const data = multipart(payload as unknown as Record<string, unknown>);
  const incident = await api.post<SafetyIncident>(
    `/api/safety-incidents/${id}/submit_rectification/`,
    data,
  );
  toastSuccess("safetyRectification.toast.submitted");
  return incident;
}

export async function reviewSafetyRectification(
  id: string,
  payload: {
    decision: "VERIFIED" | "RETURNED";
    note: string;
    image?: File;
    latitude?: string;
    longitude?: string;
    accuracy_m?: string;
    device_id?: string;
  },
): Promise<SafetyIncident> {
  const incident = await api.post<SafetyIncident>(
    `/api/safety-incidents/${id}/review_rectification/`,
    multipart(payload as unknown as Record<string, unknown>),
  );
  toastSuccess("safetyRectification.toast.reviewed");
  return incident;
}

export function getIncidentThreads(
  query: ListQuery,
): Promise<Paginated<IncidentReportThread>> {
  return api.list<IncidentReportThread>(
    "/api/incident-reports/get_incident_threads/",
    query,
  );
}

export async function getIncidentThread(
  id: string,
): Promise<IncidentReportThreadDetail> {
  const response = await api.get<IncidentReportThreadDetail>(
    `/api/incident-reports/${id}/get_incident_thread/`,
  );
  return response;
}

export async function createIncidentThread(
  payload: IncidentReportThreadPayload,
): Promise<IncidentReportThread> {
  const thread = await api.post<IncidentReportThread>(
    "/api/incident-reports/create_incident_thread/",
    multipart(payload as unknown as Record<string, unknown>),
  );
  toastSuccess("incidentReporting.submitSuccess");
  return thread;
}

export function getIncidentRecipientOptions(
  projectId: string,
): Promise<IncidentReportRecipient[]> {
  return api.get<IncidentReportRecipient[]>(
    "/api/incident-reports/recipient_options/",
    { project: projectId },
  );
}

export async function sendIncidentMessage(
  threadId: string,
  payload: IncidentReportMessagePayload,
): Promise<IncidentReportMessage> {
  const message = await api.post<IncidentReportMessage>(
    `/api/incident-reports/${threadId}/post_incident_message/`,
    multipart(payload as unknown as Record<string, unknown>),
  );
  return message;
}

export async function resolveIncidentThread(
  id: string,
): Promise<IncidentReportThread> {
  const thread = await api.post<IncidentReportThread>(
    `/api/incident-reports/${id}/resolve_incident_thread/`,
    {},
  );
  toastSuccess("incidentReporting.action.resolve");
  return thread;
}
