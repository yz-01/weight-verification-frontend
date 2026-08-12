import { api } from "@/services/api-client";
import type {
  IncidentReportMessage,
  IncidentReportMessagePayload,
  IncidentReportThread,
  IncidentReportThreadPayload,
} from "@/interfaces/incident-report";
import type { Paginated, ListQuery } from "@/interfaces/api";

export async function getIncidentThreads(params?: ListQuery) {
  return api.get<Paginated<IncidentReportThread>>(
    "/site-operations/incident-reports/get_incident_threads/",
    params
  );
}

export async function getIncidentThread(id: string) {
  return api.get<{
    thread: IncidentReportThread;
    messages: IncidentReportMessage[];
  }>(`/site-operations/incident-reports/${id}/get_incident_thread/`);
}

export async function createIncidentThread(payload: IncidentReportThreadPayload) {
  return api.post<IncidentReportThread>(
    "/site-operations/incident-reports/create_incident_thread/",
    payload
  );
}

export async function sendIncidentMessage(
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

  return api.post<IncidentReportMessage>(
    `/site-operations/incident-reports/${threadId}/post_incident_message/`,
    formData
  );
}

export async function resolveIncidentThread(threadId: string) {
  return api.post<IncidentReportThread>(
    `/site-operations/incident-reports/${threadId}/resolve_incident_thread/`
  );
}
