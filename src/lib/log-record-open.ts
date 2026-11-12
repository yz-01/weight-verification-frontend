/**
 * How one 操作记录 row opens the record it names (JB183, 客户 11-13 事项 1、2).
 *
 * The client: 「在报表历史记录点击「打开记录」，系统竟然直接跳到「仪表板」，没有
 * 打开对应的原始业务记录」「另一次点击「打开记录」，系统直接跳到 OIL & GAS 的
 * 「现场任务」页面，而且显示没有相关记录」「请仔细检查报表历史记录与各业务模块的
 * 关联，确保每条记录都能准确打开对应的原始资料，关闭后返回原来的历史记录页面」.
 *
 * A row's `link` was the page the button was pressed on (`/dashboard`,
 * `/field-tasks`, or "/" for a record with no page of its own), not the
 * record. A row opens from what it names - `record_kind` + `record_id` -
 * through this one table:
 *
 * - `WINDOW_OPENERS`: a window over the list (`LogRecordWindow`), closed back
 *   onto it;
 * - `PAGE_ONLY`: the record's own page, for the few that live only inside
 *   their module's page; the top bar's back arrow comes back to the list;
 * - `NO_SINGLE_RECORD`: a kind that names no one record (each with why).
 *
 * A kind the frontend writes and this table does not know fails
 * `jb183-log-record-open.test.ts`, which reads the kinds off the source.
 * Rows already stored are not changed: `link` stays in the data and is used
 * only by a row that names no record (「打开当时的页面」).
 */

/** The window a kind opens in (each drawn by `LogRecordWindow`). */
export type LogWindowOpener =
  /** The module's own record window (`InPlaceRecord`). */
  | "inPlace"
  /** 日报告: the report's book (`DailyReportBook`). */
  | "dailyReport"
  /** 项目进度摘要: that one summary. */
  | "progressSummary"
  /** 资料包 / Claim 资料包 (`PackageSheet`). */
  | "package"
  /** The read-only record sheet, read as a 分类管理 column reads it. */
  | "categorySheet"
  /** The read-only record sheet, read as 现场记录中心 reads it. */
  | "archiveSheet"
  | "gateIncident"
  | "visitorArrival"
  | "announcement"
  /** 废料订单: its own dialog presentation (`ViewDispatch`). */
  | "dispatch"
  /** 过磅 / 结算 / 项目: their page, drawn inside a window (as `@modal` does). */
  | "weighSession"
  | "settlement"
  | "project"
  | "incidentThread"
  /** 通行证 (`PassDetail`), read by its id. */
  | "pass"
  /** No window of its own: the record's own PDF (完整证据) in the viewer. */
  | "recordPdf";

export interface LogWindowEntry {
  opener: LogWindowOpener;
  /** The kind the window is asked for, when the log names it otherwise. */
  as?: string;
}

/** Every kind that opens in a window over the list. */
export const WINDOW_OPENERS: Readonly<Record<string, LogWindowEntry>> = {
  // 原来就有的那个记录窗口 (做法 3, first line of the table).
  MATERIAL_RECEIPT: { opener: "inPlace" },
  MATERIAL_OUTGOING: { opener: "inPlace" },
  MATERIAL_REQUEST: { opener: "inPlace" },
  SUNDRY_CLAIM: { opener: "inPlace" },
  CONSULTANT_APPLICATION: { opener: "inPlace" },
  FIELD_TASK: { opener: "inPlace" },
  // A 现场记录 row of a 分类管理 column is a field task.
  SITE_RECORD: { opener: "inPlace", as: "FIELD_TASK" },
  DOCUMENT: { opener: "inPlace" },
  // A 施工准证 is logged as HAZARD: `HazardInPlace` opens it as the permit.
  HAZARD: { opener: "inPlace" },
  SAFETY_INCIDENT: { opener: "inPlace" },
  WASTE_OUTGOING: { opener: "inPlace" },
  DISPOSAL_REQUEST: { opener: "inPlace" },
  DISPOSAL: { opener: "inPlace" },
  CLAIM: { opener: "inPlace" },
  // Claim 信件: a file of the claim, named by the claim's id.
  CLAIM_LETTER: { opener: "inPlace", as: "CLAIM" },
  EQUIPMENT_MOVEMENT: { opener: "inPlace" },
  PROGRESS: { opener: "inPlace" },
  SITE_PROGRESS: { opener: "inPlace" },
  DAILY_REPORT: { opener: "dailyReport" },
  PROGRESS_SUMMARY: { opener: "progressSummary" },
  EVIDENCE_PACKAGE: { opener: "package" },
  // 资料包信件: a file of the package, named by the package's id.
  PACKAGE_LETTER: { opener: "package" },
  SITE_EQUIPMENT: { opener: "categorySheet" },
  EQUIPMENT: { opener: "categorySheet", as: "SITE_EQUIPMENT" },
  DELIVERY_NOTE: { opener: "categorySheet" },
  ATTENDANCE_DAY: { opener: "archiveSheet" },
  GATE_INCIDENT: { opener: "gateIncident" },
  VISITOR_ARRIVAL: { opener: "visitorArrival" },
  ANNOUNCEMENT: { opener: "announcement" },
  WASTE_DISPATCH: { opener: "dispatch" },
  WEIGH_SESSION: { opener: "weighSession" },
  SETTLEMENT: { opener: "settlement" },
  PROJECT: { opener: "project" },
  INCIDENT_THREAD: { opener: "incidentThread" },
  ACCESS_PASS: { opener: "pass" },
  // A pass's general attachment slot names the pass.
  GATE_PASS: { opener: "pass" },
  // One clock-in or -out, one machine's start-to-stop: no window and no page
  // opens one, so their own PDF - what was printed or sent - is shown.
  ATTENDANCE: { opener: "recordPdf" },
  EQUIPMENT_HOURS: { opener: "recordPdf" },
};

/**
 * Kinds that live only inside their module's page (做法 3, last line): the
 * page is opened on that record; the top bar's back arrow comes back.
 */
export const PAGE_ONLY: Readonly<Record<string, (id: string) => string>> = {
  // 审批: its window needs the approvals page's own edit and decide steps.
  APPROVAL: (id) => `/approvals?approval=${id}`,
  // 找人沟通: the conversation, on 现场沟通.
  DIRECT: (id) => `/field-chats?chat=${id}`,
  // MSE's own records, with no window that reads one by its id.
  INVOICE: () => "/billing",
  EVIDENCE_ASSET: () => "/evidence",
};

/**
 * Kinds that name no one record, with why. A kind here is said plainly
 * (「这一行只记下了操作，没有可以打开的文件。」) unless the row kept a page.
 */
export const NO_SINGLE_RECORD: Readonly<Record<string, string>> = {};

/** What 「打开记录」 does for one row, or null when nothing opens. */
export type LogRowTarget =
  | { window: LogWindowOpener; kind: string; id: string }
  | { page: string }
  /** 「打开当时的页面」: the page the row was written on (no record named). */
  | { pastPage: string }
  | null;

/** A stored `link` that is a page of this site worth going to. */
function pastPage(link: string | null | undefined): string | null {
  const path = (link ?? "").trim();
  // A path of this site only; "/" is the old "no page" (it lands on 仪表板).
  if (!path.startsWith("/") || path.startsWith("//") || path === "/") return null;
  return path;
}

/** How the row opens: the record it names first, then the page it kept. */
export function logRowTarget(row: {
  record_kind?: string | null;
  record_id?: string | null;
  link?: string | null;
}): LogRowTarget {
  const kind = (row.record_kind ?? "").trim();
  const id = (row.record_id ?? "").trim();
  if (kind && id) {
    const entry = WINDOW_OPENERS[kind];
    if (entry) return { window: entry.opener, kind: entry.as ?? kind, id };
    const page = PAGE_ONLY[kind];
    if (page) return { page: page(encodeURIComponent(id)) };
  }
  const path = pastPage(row.link);
  return path ? { pastPage: path } : null;
}

/** Every kind the table knows, for the test. */
export const KNOWN_LOG_KINDS: readonly string[] = [
  ...Object.keys(WINDOW_OPENERS),
  ...Object.keys(PAGE_ONLY),
  ...Object.keys(NO_SINGLE_RECORD),
];
