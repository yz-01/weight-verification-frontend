/**
 * 司机专属打卡链接 (J26, item 125): the office's links, and the driver's side.
 *
 * The driver's side has no account: the token in the address is the
 * credential and every call names the phone (`device`), which the first open
 * binds to the number the office registered - as the worker's location link.
 */

import type {
  EquipmentHoursUpload,
  EquipmentPhoneRecord,
  EquipmentPhoneTotals,
  EquipmentPhotoKind,
} from "@/interfaces/equipment-hours";
import { api, toastSuccess } from "@/services/api-client";

export type DriverLinkStatus = "NOT_OPENED" | "IN_USE" | "STOPPED";

export interface DriverClockLink {
  id: string;
  project: string;
  project_name: string;
  driver_name: string;
  cidb_no: string;
  supplier: string | null;
  company_name: string;
  phone: string;
  is_active: boolean;
  status: DriverLinkStatus;
  last6: string;
  issued_at: string | null;
  bound_at: string | null;
  last_used_at: string | null;
  deactivated_at: string | null;
  /** Only in the answer that made the link: shown once, never kept. */
  url?: string;
}

export interface DriverLinkPayload {
  project: string;
  driver_name: string;
  cidb_no: string;
  supplier?: string | null;
  company_name?: string;
  phone: string;
}

export function listDriverLinks(project?: string): Promise<DriverClockLink[]> {
  return api.get<DriverClockLink[]>("/api/driver-clock-links/list_links/", project ? { project } : undefined);
}

export async function createDriverLink(payload: DriverLinkPayload): Promise<DriverClockLink> {
  const row = await api.post<DriverClockLink>("/api/driver-clock-links/create_link/", payload);
  toastSuccess("driverClock.toast.created");
  return row;
}

export async function reissueDriverLink(link: string): Promise<DriverClockLink> {
  const row = await api.post<DriverClockLink>("/api/driver-clock-links/reissue_link/", { link });
  toastSuccess("driverClock.toast.reissued");
  return row;
}

export async function stopDriverLink(link: string): Promise<DriverClockLink> {
  const row = await api.post<DriverClockLink>("/api/driver-clock-links/stop_link/", { link });
  toastSuccess("driverClock.toast.stopped");
  return row;
}

// -- the driver's side ---------------------------------------------------------

export interface DriverLinkState {
  project_name: string;
  bound: boolean;
  driver_name: string;
  cidb_no: string;
  company_name: string;
}

export interface DriverMachine {
  id: string;
  site_no: string;
  code: string;
  name: string;
  plate: string;
  supplier_name: string;
  open_since: string | null;
  unclosed_since: string | null;
}

const base = (token: string) => `/api/driver-clock/${encodeURIComponent(token)}`;

export function getDriverLink(token: string, device: string): Promise<DriverLinkState> {
  return api.get<DriverLinkState>(`${base(token)}/get_link/`, { device }, { auth: false, silent: true });
}

export function bindDriverPhone(token: string, device: string, phone: string): Promise<DriverLinkState> {
  return api.post<DriverLinkState>(`${base(token)}/bind_phone/`, { device, phone }, { auth: false, silent: true });
}

export function getDriverMachines(token: string, device: string): Promise<DriverMachine[]> {
  return api.get<DriverMachine[]>(`${base(token)}/machines/`, { device }, { auth: false, silent: true });
}

/** 「我的记录」 (J37-1): the driver's own last 30 days and this month's totals. */
export interface DriverMyRecords {
  days: number;
  rows: EquipmentPhoneRecord[];
  month_totals: EquipmentPhoneTotals;
}

export function getDriverMyRecords(token: string, device: string): Promise<DriverMyRecords> {
  return api.get<DriverMyRecords>(`${base(token)}/my_records/`, { device }, { auth: false, silent: true });
}

/** One 开工 or 收工 from the link, as the offline queue replays it too. */
export async function clockDriverLink(
  token: string,
  draft: {
    device: string;
    equipment: string;
    kind: EquipmentPhotoKind;
    photo: File;
    signature?: File;
    capturedAt: string;
    clientEventId: string;
    latitude?: string;
    longitude?: string;
    locationAccuracyM?: string;
  },
): Promise<EquipmentHoursUpload> {
  const data = new FormData();
  data.append("device", draft.device);
  data.append("equipment", draft.equipment);
  data.append("kind", draft.kind);
  data.append("photo", draft.photo);
  if (draft.signature) data.append("signature", draft.signature);
  data.append("captured_at", draft.capturedAt);
  data.append("client_event_id", draft.clientEventId);
  if (draft.latitude && draft.longitude) {
    data.append("latitude", draft.latitude);
    data.append("longitude", draft.longitude);
  }
  if (draft.locationAccuracyM) data.append("location_accuracy_m", draft.locationAccuracyM);
  const row = await api.post<{
    id: string;
    equipment: string;
    kind: EquipmentPhotoKind;
    captured_at: string;
    client_event_id: string;
  }>(`${base(token)}/clock/`, data, { auth: false, silent: true });
  return {
    id: row.id,
    equipment: row.equipment,
    kind: row.kind,
    captured_at: row.captured_at,
    work_date: row.captured_at.slice(0, 10),
    client_event_id: row.client_event_id,
    session: null,
  };
}
