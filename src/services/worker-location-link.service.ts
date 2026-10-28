/**
 * The worker's side of the location link (I20): no account, no PIN.
 *
 * The token in the address is the credential. Every call names the phone
 * (`device`) so the server keeps the link on the phone that confirmed the
 * worker's number. All silent: the page has its own screens for a closed or
 * foreign link, and a fix that does not get through is the next one's job.
 */

import type { CaptureResult, CaptureState, WorkerLinkState } from "@/interfaces/site-workers";
import { api } from "@/services/api-client";

const base = (token: string) => `/api/worker-location-link/${encodeURIComponent(token)}`;

export function getWorkerLink(token: string, device: string): Promise<WorkerLinkState> {
  return api.get<WorkerLinkState>(`${base(token)}/get_link/`, { device }, { auth: false, silent: true });
}

export function bindWorkerPhone(token: string, device: string, phone: string): Promise<WorkerLinkState> {
  return api.post<WorkerLinkState>(`${base(token)}/bind_phone/`, { device, phone }, { auth: false, silent: true });
}

export function startWorkerLocation(token: string, device: string): Promise<WorkerLinkState> {
  return api.post<WorkerLinkState>(`${base(token)}/start_location/`, { device }, { auth: false, silent: true });
}

export function recordWorkerPosition(
  token: string,
  device: string,
  fix: { latitude: string; longitude: string; accuracy_m?: string; recorded_at?: string },
): Promise<{ received_at: string; outside_fence?: boolean }> {
  // J25: `outside_fence` - outside the site nothing of where was kept.
  return api.post<{ received_at: string; outside_fence?: boolean }>(
    `${base(token)}/record_position/`,
    { device, ...fix },
    { auth: false, silent: true },
  );
}

// --- A phone's passport-capture link (JB61-1) --------------------------------

const capture = (token: string) => `/api/passport-capture/${encodeURIComponent(token)}`;

export function getCapture(token: string): Promise<CaptureState> {
  return api.get<CaptureState>(`${capture(token)}/get_capture/`, undefined, { auth: false, silent: true });
}

export function uploadCapturePhoto(token: string, file: File): Promise<CaptureResult> {
  const body = new FormData();
  body.append("file", file);
  return api.post<CaptureResult>(`${capture(token)}/upload_photo/`, body, { auth: false, silent: true });
}

/** 「重拍」: take back the photo this phone just sent. */
export function discardCaptureRow(token: string, row: string): Promise<{ discarded: boolean; phone_count: number }> {
  return api.post<{ discarded: boolean; phone_count: number }>(
    `${capture(token)}/discard_row/`,
    { row },
    { auth: false, silent: true },
  );
}
