import { taskStatusView } from "@/components/schedule-planning/task-status";
import type {
  ContractorReportRecord,
  ContractorReportType,
} from "@/interfaces/contractor-report";
import { attendanceRecordHref } from "@/lib/dashboard-cards";
import { recordTarget, type RecordTarget } from "@/lib/record-routes";
import { photoSourceModuleKey } from "@/lib/report-menu";

/**
 * 报表中心 → 报表预览 (2026-10-09). Lucas: 「所有的报表预览，每一项如果有照片
 * 的话就放照片的 previews，然后每一项都可以点进去操作，是每个报表。」
 *
 * Three things a preview row needs beyond its columns, kept here so they can
 * be tested without the screen:
 *
 * - where the row opens (`reportRowTarget`): the record where its own module
 *   opens it - the same links the dashboard and the notifications use;
 * - which module screen that is (`reportRowRoute`), so a row is a link only
 *   for a reader the console would let in;
 * - the words for a column that holds a code (`reportValueKey`): 「DISPOSAL」
 *   and 「COMPLETED」 were printed as they came from the server.
 */

type ReportRow = Record<string, string | number | boolean | null>;

/**
 * Where a row opens: a page, the shared record sheet, or nowhere.
 *
 * Mostly `recordTarget`, the one function every "open this record" asks. Three
 * kinds open better here than there, each on its module's own screen:
 *
 * - a clock-in has no page; it opens that person's day in 人员进场记录, as the
 *   dashboard's 今日进出打卡 does;
 * - an equipment movement opens in 设备进退场, where the office accepts it
 *   (`?movement=`), rather than in the read-only sheet;
 * - a document opens its detail in 项目资料 (`?document=`).
 */
export function reportRowTarget(
  entry: ContractorReportRecord | null | undefined,
): RecordTarget {
  if (!entry?.kind || !entry.id) return null;
  const id = encodeURIComponent(entry.id);
  switch (entry.kind) {
    case "ATTENDANCE":
      return entry.user_id && entry.date
        ? {
            href: attendanceRecordHref({
              user: entry.user_id,
              date: entry.date,
              project: entry.project_id ?? undefined,
            }),
          }
        : null;
    case "EQUIPMENT_MOVEMENT":
      return { href: `/site-equipment?movement=${id}` };
    case "DOCUMENT":
      return { href: `/documents?document=${id}` };
    default:
      return recordTarget(entry.kind, entry.id);
  }
}

/** The module screen behind a record sheet, for the route check. */
const SHEET_ROUTES: Record<string, string> = {
  PROGRESS: "/progress",
  SITE_EQUIPMENT: "/site-equipment",
  EQUIPMENT_MOVEMENT: "/site-equipment",
  DELIVERY_NOTE: "/receipts",
};

/**
 * The path the console's route guard is asked about before a row is a link:
 * the page itself, or the module a record sheet belongs to.
 */
export function reportRowRoute(target: RecordTarget): string | null {
  if (!target) return null;
  if ("href" in target) return target.href.split("?", 1)[0];
  return SHEET_ROUTES[target.sheet] ?? null;
}

/** The columns that name a row, first match wins - for the viewer and the label. */
const REFERENCE_COLUMNS = [
  "reference_no",
  "incident_no",
  "application_no",
  "document_no",
  "equipment",
  "worker",
  "phase",
  "task",
  "target_name",
  "file_name",
] as const;

export function reportRowReference(row: ReportRow): string {
  for (const key of REFERENCE_COLUMNS) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return "";
}

/** Reference numbers: wide enough to read whole, and never clamped. */
export const REPORT_REFERENCE_COLUMNS: ReadonlySet<string> = new Set([
  "reference_no",
  "incident_no",
  "application_no",
  "document_no",
]);

/** Each report's statuses, in the words its own module uses. */
const STATUS_NAMESPACE: Partial<Record<ContractorReportType, string>> = {
  progress: "contractorOps.progressStatus",
  safety: "safetyRectification.status",
  consultant: "consultantWorkflow.status",
  documents: "documents.status",
};

/** Columns that hold a code, wherever they appear. */
const COLUMN_NAMESPACE: Record<string, string> = {
  final_decision: "consultantWorkflow.status",
  event: "attendance.event",
  geofence_result: "fieldStaffPwa.attendance.geofence",
  direction: "contractorOps.direction",
  ocr_status: "siteDisposal.ocr",
  target_type: "contractorReports.value.targetType",
  period: "businessTargets.period",
};

/** 记录类型 of the recycling report: the two tabs of 清运与回收. */
const RECORD_TYPE_KEYS: Record<string, string> = {
  DISPOSAL: "wasteClearance.kind.disposal",
  RECYCLE_ORDER: "wasteClearance.kind.dispatch",
};

/** The record kinds a site photograph belongs to, as the head office names them. */
const PHOTO_RECORD_KINDS: ReadonlySet<string> = new Set([
  "DELIVERY_NOTE",
  "DISPOSAL",
  "EQUIPMENT",
  "EQUIPMENT_MOVEMENT",
  "FIELD_TASK",
  "GATE_INCIDENT",
  "MATERIAL_OUTGOING",
  "MATERIAL_RECEIPT",
  "SAFETY_INCIDENT",
  "SITE_PROGRESS",
  "WASTE_DISPATCH",
  "WASTE_OUTGOING",
]);

/**
 * The message key for a cell that holds a code, or `null` for a cell that is
 * already the reader's text (a name, a number, a date).
 *
 * `record` is the row's entry in `records`, for the photo report's 来源记录.
 */
export function reportValueKey(
  reportType: ContractorReportType,
  column: string,
  value: string | number | boolean | null,
  row: ReportRow,
  record?: ContractorReportRecord | null,
): string | null {
  if (typeof value === "boolean") {
    return value ? "contractorReports.value.yes" : "contractorReports.value.no";
  }
  if (value === null || value === "") return null;
  const code = String(value);
  if (reportType === "photos") {
    // The server names a photograph's source by its table
    // (`receiving.receiptphoto`); the reader knows the module.
    const owner = photoSourceModuleKey(String(row.source ?? ""));
    if (column === "category") return owner ?? null;
    if (column === "source") {
      return record?.kind && PHOTO_RECORD_KINDS.has(record.kind)
        ? `headquarters.recordKind.${record.kind}`
        : (owner ?? null);
    }
    return null;
  }
  if (column === "record_type") return RECORD_TYPE_KEYS[code] ?? null;
  if (column === "status") {
    if (reportType === "recycling") {
      return row.record_type === "DISPOSAL"
        ? `siteDisposal.status.${code}`
        : `dispatches.state.${code}`;
    }
    if (reportType === "schedule") {
      const view = taskStatusView({
        schedule_status: code as Parameters<typeof taskStatusView>[0]["schedule_status"],
        delay_days: 0,
      });
      return `schedulePlanning.status.${view.key}`;
    }
    if (reportType === "target") {
      return `businessTargets.status.${code === "ACTIVE" ? "active" : "inactive"}`;
    }
    const namespace = STATUS_NAMESPACE[reportType];
    return namespace ? `${namespace}.${code}` : null;
  }
  const namespace = COLUMN_NAMESPACE[column];
  return namespace ? `${namespace}.${code}` : null;
}
