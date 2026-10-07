/** 设备操作员工时 (2026-10 B15): the phone's photos and the office's hours. */

import type {
  EquipmentDayAdjustmentPayload,
  EquipmentHoursDay,
  EquipmentHoursDays,
  EquipmentHoursMachine,
  EquipmentHoursMonth,
  EquipmentHoursUpload,
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
  photo: File;
  capturedAt: string;
  clientEventId: string;
  latitude?: string;
  longitude?: string;
  locationAccuracyM?: string;
}

/** The site's working machines, name and plate (no categories, F3). */
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

export interface EquipmentHoursQuery {
  project?: string;
  equipment?: string;
  date_from?: string;
  date_to?: string;
}

function clean(query: EquipmentHoursQuery): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

export function getEquipmentHoursDays(query: EquipmentHoursQuery): Promise<EquipmentHoursDays> {
  return api.get<EquipmentHoursDays>("/api/equipment-hours/get_days/", clean(query));
}

export function getEquipmentHoursMonth(query: {
  month: string;
  project?: string;
  equipment?: string;
}): Promise<EquipmentHoursMonth> {
  return api.get<EquipmentHoursMonth>("/api/equipment-hours/get_month/", clean(query));
}

/** The office enters or corrects a day's end time; kept with who and why. */
export async function adjustEquipmentDayEnd(
  payload: EquipmentDayAdjustmentPayload,
): Promise<EquipmentHoursDay> {
  const day = await api.post<EquipmentHoursDay>("/api/equipment-hours/adjust_end/", payload);
  toastSuccess("equipmentHours.toast.endSaved");
  return day;
}

export interface EquipmentHoursSummaryLabels {
  title: string;
  equipment_label: string;
  plate_label: string;
  days_label: string;
  hours_label: string;
  missing_label: string;
}

/** The day table as a spreadsheet or a compact PDF (E7: no chat, small photos). */
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
