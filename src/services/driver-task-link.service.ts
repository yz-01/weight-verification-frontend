/**
 * The driver's side of a trip link: no account, no PIN.
 *
 * The token in the address is the whole credential and opens one trip - one
 * order number - and nothing else. Every call names the phone (`device`), so
 * the server can keep the link on the first phone that opened it.
 *
 * Reading is silent - the link page has a screen of its own for a closed or
 * foreign link. A refused step or photo is toasted like anywhere else, in the
 * driver's language, from the backend's error code.
 */

import type { DriverTaskDetail, TaskPositionEvent, TaskState } from "@/interfaces/recycler";
import { api, toastSuccess } from "@/services/api-client";

const options = (device: string) => ({ auth: false, query: { device } }) as const;

export function getLinkedTask(token: string, device: string): Promise<DriverTaskDetail> {
  return api.get<DriverTaskDetail>(`/api/driver-task-link/${encodeURIComponent(token)}/get_task/`, { device }, {
    auth: false,
    silent: true,
  });
}

export async function advanceLinkedTask(
  token: string,
  device: string,
  payload: {
    state: TaskState;
    reason?: string;
    latitude?: string;
    longitude?: string;
  },
): Promise<DriverTaskDetail> {
  const task = await api.post<DriverTaskDetail>(
    `/api/driver-task-link/${encodeURIComponent(token)}/advance_task/`,
    payload,
    options(device),
  );
  toastSuccess("tasks.toast.advanced");
  return task;
}

export async function addLinkedTaskPhoto(
  token: string,
  device: string,
  file: File,
  kind: string,
  position: { latitude?: string; longitude?: string },
): Promise<unknown> {
  const form = new FormData();
  form.append("image", file);
  form.append("kind", kind);
  form.append("taken_at", new Date().toISOString());
  if (position.latitude) form.append("latitude", position.latitude);
  if (position.longitude) form.append("longitude", position.longitude);
  const photo = await api.post(`/api/driver-task-link/${encodeURIComponent(token)}/add_photo/`, form, options(device));
  toastSuccess("driver.toast.photoSent");
  return photo;
}

export function recordLinkedTaskPosition(
  token: string,
  device: string,
  sample: {
    latitude: string;
    longitude: string;
    accuracyM?: string;
    eventType?: TaskPositionEvent;
    originalOccurredAt?: string;
  },
): Promise<unknown> {
  // Silent: a sample that does not get through is simply the next one's job.
  return api.post(
    `/api/driver-task-link/${encodeURIComponent(token)}/record_position/`,
    {
      latitude: sample.latitude,
      longitude: sample.longitude,
      ...(sample.accuracyM ? { accuracy_m: sample.accuracyM } : {}),
      ...(sample.eventType ? { event_type: sample.eventType } : {}),
      original_occurred_at: sample.originalOccurredAt ?? new Date().toISOString(),
    },
    { ...options(device), silent: true },
  );
}
