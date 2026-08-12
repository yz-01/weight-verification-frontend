import { apiClient } from "@/services/api-client";
import type {
  IncidentReportMessage,
  IncidentReportMessagePayload,
  IncidentReportThread,
  IncidentReportThreadPayload,
} from "@/interfaces/incident-report";
import type { ListResponse } from "@/interfaces/common";

export async function getIncidentThreads(params?: Record<string, unknown>) {
  const response = await apiClient.get<ListResponse<IncidentReportThread>>(
    "/site-operations/incident-reports/get_incident_threads/",
    { params }
  );
  return response.data;
}

export async function getIncidentThread(id: string) {
  const response = await apiClient.get<{
    success: boolean;
    data: {
      thread: IncidentReportThread;
      messages: IncidentReportMessage[];
    };
  }>(`/site-operations/incident-reports/${id}/get_incident_thread/`);
  return response.data.data;
}

export async function createIncidentThread(payload: IncidentReportThreadPayload) {
  const response = await apiClient.post<{
    success: boolean;
    data: IncidentReportThread;
  }>("/site-operations/incident-reports/create_incident_thread/", payload);
  return response.data.data;
}

export async function postIncidentMessage(
  threadId: string,
  payload: IncidentReportMessagePayload
) {
  const formData = new FormData();
  formData.append("body", payload.body);
  if (payload.photo) formData.append("photo", payload.photo);
  if (payload.latitude) formData.append("latitude", payload.latitude);
  if (payload.longitude) formData.append("longitude", payload.longitude);
  if (payload.accuracy_m) formData.append("accuracy_m", payload.accuracy_m);
  if (payload.client_event_id) formData.append("client_event_id", payload.client_event_id);

  const response = await apiClient.post<{
    success: boolean;
    data: IncidentReportMessage;
  }>(`/site-operations/incident-reports/${threadId}/post_incident_message/`, formData);
  return response.data.data;
}

export async function resolveIncidentThread(threadId: string) {
  const response = await apiClient.post<{
    success: boolean;
    data: IncidentReportThread;
  }>(`/site-operations/incident-reports/${threadId}/resolve_incident_thread/`);
  return response.data.data;
}
