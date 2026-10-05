import type { CategoryRecordKind } from "@/interfaces/contractor-ops";
import type {
  HeadquartersCountField,
  HeadquartersPhoto,
  PhotoRecordKind,
} from "@/interfaces/headquarters";

/** The 项目 Dashboard of one project (C11). */
export function projectDashboardHref(projectId: string): string {
  return `/dashboard/project?project=${encodeURIComponent(projectId)}`;
}

/**
 * Where one project's figure in a drill-down leads: the list that holds what
 * was counted, with the same filter the server counted it by, or that
 * project's dashboard when no list narrows that way.
 */
export function drillHref(field: HeadquartersCountField, projectId: string): string {
  const project = encodeURIComponent(projectId);
  switch (field) {
    case "on_site_now":
      return `/emergency-list?project=${project}`;
    case "open_tasks":
      return `/field-tasks?open=1&project=${project}`;
    case "overdue_tasks":
      return `/field-tasks?overdue=1&project=${project}`;
    case "overdue_rectifications":
      return `/hazard-rectifications?overdue=1&project=${project}`;
    case "material_receipts_today":
      return `/receipts?project=${project}`;
    case "pending_approvals":
      return `${projectDashboardHref(projectId)}#dashboard-approvals`;
    default:
      return projectDashboardHref(projectId);
  }
}

/**
 * The detail sheet that opens a photo's record in place - the same one
 * Category Management opens (「与总栏目同一个详情」).
 */
const SHEET_KINDS: Partial<Record<PhotoRecordKind, CategoryRecordKind>> = {
  MATERIAL_RECEIPT: "MATERIAL_RECEIPT",
  DELIVERY_NOTE: "DELIVERY_NOTE",
  MATERIAL_OUTGOING: "MATERIAL_OUTGOING",
  EQUIPMENT_MOVEMENT: "EQUIPMENT_MOVEMENT",
  EQUIPMENT: "SITE_EQUIPMENT",
  SITE_PROGRESS: "PROGRESS",
  DISPOSAL: "DISPOSAL_REQUEST",
  WASTE_OUTGOING: "WASTE_OUTGOING",
  SAFETY_INCIDENT: "HAZARD",
};

/** Records the sheet does not serve open on their own screen instead. */
const SCREENS: Partial<Record<PhotoRecordKind, (id: string) => string>> = {
  FIELD_TASK: (id) => `/field-tasks?task=${id}`,
  WASTE_DISPATCH: (id) => `/dispatches/${id}`,
  GATE_INCIDENT: (id) => `/site-access?tab=gate-records&gate_incident=${id}`,
};

export type PhotoTarget =
  | { sheet: CategoryRecordKind; id: string }
  | { href: string }
  | null;

/** Where clicking a photo of today's site takes the reader (C14). */
export function photoTarget(
  photo: Pick<HeadquartersPhoto, "record_kind" | "record_id">,
): PhotoTarget {
  if (!photo.record_id) return null;
  const sheet = SHEET_KINDS[photo.record_kind];
  if (sheet) return { sheet, id: photo.record_id };
  const screen = SCREENS[photo.record_kind];
  return screen ? { href: screen(encodeURIComponent(photo.record_id)) } : null;
}

export const PHOTO_RECORD_KINDS = [
  ...Object.keys(SHEET_KINDS),
  ...Object.keys(SCREENS),
] as PhotoRecordKind[];
