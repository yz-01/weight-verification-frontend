import type {
  HeadquartersCountField,
  HeadquartersPhoto,
  PhotoRecordKind,
} from "@/interfaces/headquarters";
import { recordTarget, type RecordTarget } from "@/lib/record-routes";

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

export type { RecordTarget as PhotoTarget } from "@/lib/record-routes";

/**
 * Where clicking a photo of today's site takes the reader (C14, F9): the
 * record's own business detail - the accepted delivery with both signatures,
 * not the record centre's 确认归档 sheet. One function for every place that
 * opens a record (`lib/record-routes`).
 */
export function photoTarget(
  photo: Pick<HeadquartersPhoto, "record_kind" | "record_id">,
): RecordTarget {
  return recordTarget(photo.record_kind, photo.record_id);
}

export const PHOTO_RECORD_KINDS: PhotoRecordKind[] = [
  "MATERIAL_RECEIPT",
  "DELIVERY_NOTE",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "EQUIPMENT",
  "SITE_PROGRESS",
  "FIELD_TASK",
  "DISPOSAL",
  "WASTE_OUTGOING",
  "WASTE_DISPATCH",
  "SAFETY_INCIDENT",
  "GATE_INCIDENT",
];
