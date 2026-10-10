/** 设备操作员工时 (2026-10 B15): the phone's photos and the office's hours. */

import type {
  EquipmentDayAdjustmentPayload,
  EquipmentHoursFilterOptions,
  EquipmentHoursMachine,
  EquipmentHoursMonth,
  EquipmentHoursSession,
  EquipmentHoursSessions,
  EquipmentHoursUpload,
  EquipmentPhotoKind,
} from "@/interfaces/equipment-hours";
import { api, download, toastSuccess } from "@/services/api-client";
import {
  exportBody,
  exportQuery,
  type ExportRequest,
} from "@/services/contractor.service";

/** One queued photo exactly as it goes to the server. */
export interface EquipmentHoursPhotoUpload {
  equipment: string;
  /** 开工 or 收工; absent only on a job queued before the choice existed. */
  kind?: EquipmentPhotoKind;
  photo: File;
  capturedAt: string;
  clientEventId: string;
  latitude?: string;
  longitude?: string;
  locationAccuracyM?: string;
}

/** The site's working machines: number, name, plate, supplier (no categories, F3). */
export function getEquipmentHoursMachines(project?: string): Promise<EquipmentHoursMachine[]> {
  return api.get<EquipmentHoursMachine[]>(
    "/api/equipment-hours/equipment_options/",
    project ? { project } : undefined,
  );
}

/**
 * Send one photo. Silent: the offline queue decides what the worker is told,
 * and a replay must not toast for a photo taken an hour ago.
 */
export function uploadEquipmentHoursPhoto(
  upload: EquipmentHoursPhotoUpload,
): Promise<EquipmentHoursUpload> {
  const data = new FormData();
  data.append("equipment", upload.equipment);
  if (upload.kind) data.append("kind", upload.kind);
  data.append("photo", upload.photo);
  data.append("captured_at", upload.capturedAt);
  data.append("client_event_id", upload.clientEventId);
  if (upload.latitude) data.append("latitude", upload.latitude);
  if (upload.longitude) data.append("longitude", upload.longitude);
  if (upload.locationAccuracyM) {
    data.append("location_accuracy_m", upload.locationAccuracyM);
  }
  return api.post<EquipmentHoursUpload>("/api/equipment-hours/upload_photo/", data, {
    silent: true,
  });
}

/**
 * The office's filters (Lucas 2026-10-10: 「可以filter设备等等」). No dates
 * means the latest records: the server answers with the range it chose.
 */
export interface EquipmentHoursQuery {
  project?: string;
  equipment?: string;
  supplier?: string;
  /** 车牌 / 设备编号 / 现场编号 search. */
  q?: string;
  date_from?: string;
  date_to?: string;
}

function clean(query: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

/** One row per start-stop, oldest first, with 累计工时. */
export function getEquipmentHoursDays(query: EquipmentHoursQuery): Promise<EquipmentHoursSessions> {
  return api.get<EquipmentHoursSessions>("/api/equipment-hours/get_days/", clean(query));
}

/** The 设备 and 供应商 lists of the filter bar: what has hours here. */
export function getEquipmentHoursFilterOptions(
  project?: string,
): Promise<EquipmentHoursFilterOptions> {
  return api.get<EquipmentHoursFilterOptions>(
    "/api/equipment-hours/filter_options/",
    project ? { project } : undefined,
  );
}

/** Per machine for a month; no month means the month of the newest record. */
export function getEquipmentHoursMonth(
  query: Omit<EquipmentHoursQuery, "date_from" | "date_to"> & { month?: string },
): Promise<EquipmentHoursMonth> {
  return api.get<EquipmentHoursMonth>("/api/equipment-hours/get_month/", clean(query));
}

/**
 * The office enters or corrects a session's end time - or, for a stop photo
 * with no start, its start time; kept with who and why.
 */
export async function adjustEquipmentDayEnd(
  payload: EquipmentDayAdjustmentPayload,
): Promise<EquipmentHoursSession> {
  const session = await api.post<EquipmentHoursSession>(
    "/api/equipment-hours/adjust_end/",
    payload,
  );
  toastSuccess(
    payload.start_at ? "equipmentHours.toast.startSaved" : "equipmentHours.toast.endSaved",
  );
  return session;
}

/**
 * 「设备编号管理」: the project's working machines with their 现场编号 - or
 * every project's, with no project.
 */
export function getEquipmentSiteNumbers(project?: string): Promise<EquipmentHoursMachine[]> {
  return api.get<EquipmentHoursMachine[]>(
    "/api/equipment-hours/site_numbers/",
    project ? { project } : undefined,
  );
}

/** Give a machine its 现场编号, change it, or clear it (blank). */
export async function setEquipmentSiteNo(
  equipment: string,
  siteNo: string,
): Promise<EquipmentHoursMachine> {
  const machine = await api.post<EquipmentHoursMachine>(
    "/api/equipment-hours/set_site_no/",
    { equipment, site_no: siteNo },
  );
  toastSuccess(
    machine.site_no ? "equipmentHours.toast.siteNoSaved" : "equipmentHours.toast.siteNoCleared",
  );
  return machine;
}

export interface EquipmentHoursSummaryLabels {
  title: string;
  equipment_label: string;
  site_no_label?: string;
  plate_label: string;
  supplier_label: string;
  sessions_label: string;
  hours_label: string;
  missing_label: string;
}

/** The table as a spreadsheet or a compact PDF: same rows, columns, filters (E7). */
export function exportEquipmentHoursDays(
  request: ExportRequest,
  summary: EquipmentHoursSummaryLabels,
): Promise<void> {
  return download("/api/equipment-hours/export_days/", {
    method: "POST",
    query: exportQuery(request),
    body: { ...exportBody(request), summary },
    fallbackFilename: `equipment-hours.${request.format}`,
  });
}

const MACHINE_CACHE = "mse.equipment-hours.machines";

/**
 * The machine list, also with no signal (B15 「可离线」).
 *
 * The operator often stands where there is no network when he starts the
 * machine. The last list this phone read for the site is kept and used when
 * the server cannot be reached - so the photo can still be taken and queued.
 */
export async function loadEquipmentHoursMachines(
  project: string,
): Promise<EquipmentHoursMachine[]> {
  const key = `${MACHINE_CACHE}.${project || "all"}`;
  try {
    const rows = await getEquipmentHoursMachines(project || undefined);
    try {
      window.localStorage.setItem(key, JSON.stringify(rows));
    } catch {
      // Storage blocked: the list still works while online.
    }
    return rows;
  } catch (error) {
    try {
      const cached = window.localStorage.getItem(key);
      if (cached) return JSON.parse(cached) as EquipmentHoursMachine[];
    } catch {
      // Fall through to the original failure.
    }
    throw error;
  }
}
