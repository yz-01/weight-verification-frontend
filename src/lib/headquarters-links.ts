import type {
  HeadquartersCountField,
  HeadquartersOverview,
  HeadquartersPhoto,
  PhotoRecordKind,
} from "@/interfaces/headquarters";
import { approvalsListHref } from "@/lib/dashboard-cards";
import { recordTarget, type RecordTarget } from "@/lib/record-routes";

/** The 项目 Dashboard of one project (C11). */
export function projectDashboardHref(projectId: string): string {
  return `/dashboard/project?project=${encodeURIComponent(projectId)}`;
}

/** What a head-office card can be: one of the figures, or a clearance card. */
export type HeadquartersCard =
  | HeadquartersCountField
  | "projects"
  | "waste_dispatches"
  | "site_disposals";

function withQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/**
 * Where a head-office card goes (F8, Q22): straight to the thing it counts -
 * the module's list, filtered the way the server counted the figure - never
 * to a project's dashboard. `project` narrows it to one project; left out,
 * the list shows every project the reader can see, with the same filter.
 *
 * `null` for 今日现场记录: ten kinds of record that no one list holds, so that
 * card opens its breakdown by project and kind instead.
 *
 * The backend test `test_every_card_lands_on_a_list_of_exactly_what_it_counts`
 * reads each list with these parameters and compares the counts.
 */
export function cardHref(
  card: HeadquartersCard,
  { project, date }: { project?: string; date: string },
): string | null {
  switch (card) {
    case "projects":
      return "/projects";
    case "today_records":
      return null;
    case "pending_approvals":
      // 总部集中审批 (C16).
      return approvalsListHref(project);
    case "overdue_rectifications":
      return withQuery("/hazard-rectifications", { overdue: "1", project });
    case "material_receipts_today":
      // Material In for the day: the receipts list's default view.
      return withQuery("/receipts", { date_from: date, date_to: date, project });
    case "open_tasks":
      return withQuery("/field-tasks", { open: "1", project });
    case "overdue_tasks":
      return withQuery("/field-tasks", { overdue: "1", project });
    case "on_site_now":
      // 人员进场: its 当前现场总人数 is this figure (C21).
      return withQuery("/attendance", { project });
    case "waste_dispatches":
      return withQuery("/waste-clearance", { kind: "dispatch", counted: "1", project });
    case "site_disposals":
      return withQuery("/waste-clearance", { kind: "disposal", counted: "1", project });
  }
}

/**
 * The project a card's list is narrowed to (F8): the reader's one project, so
 * the list opens on it; none when they see several, so the list shows them
 * all. A figure that also counts something tied to no project (a company-wide
 * approval - the 「其他」 row) is never narrowed, or the list would come up
 * short of the number.
 */
export function cardProject(
  data: Pick<HeadquartersOverview, "projects" | "other">,
  card: HeadquartersCard,
): string | undefined {
  if (data.projects.length !== 1) return undefined;
  const other =
    card === "waste_dispatches" || card === "site_disposals"
      ? data.other[card].records
      : card === "projects"
        ? 0
        : data.other[card];
  return other > 0 ? undefined : data.projects[0].id;
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
