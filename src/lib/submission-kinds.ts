/**
 * What each row of the phone's 「我提交过的」 is called, and where its status
 * is named (JB116).
 *
 * Lucas 11-06: 「这个部分应该是会显示所有不管什么的提交记录才对」 - the list
 * now carries every kind the phone sends, and each needs a name and a status
 * in the reader's language rather than a code.
 */

import type { MySubmissionRow } from "@/interfaces/contractor";

/**
 * Where a kind's statuses are named when the phone names them its own way,
 * ahead of the record centre's words (`RECORD_STATUS_NAMESPACE`).
 */
export const PHONE_STATUS_NAMESPACE: Record<string, string> = {
  // The phone names a site record's status the way its own task list does
  // (已完成, 需要重拍), not the office's words.
  SITE_RECORD: "fieldStaffPwa.status",
  // JB116: each in the words its own screen uses.
  GATE_INCIDENT: "mySubmissions.gateStatus",
  VISITOR_ARRIVAL: "siteControl.visitorArrival.status",
  EQUIPMENT_HOURS: "equipmentHours.kind",
  ATTENDANCE: "attendance.event",
  PERMIT: "permits.status",
};

/** The statuses the server sends for the JB116 kinds, for the catalogue check. */
export const PHONE_KIND_STATUSES: Record<string, readonly string[]> = {
  GATE_INCIDENT: ["RECORDED", "OPEN", "CLOSED"],
  VISITOR_ARRIVAL: ["AWAITING_HOST", "CONFIRMED", "DECLINED", "CANCELLED"],
  EQUIPMENT_HOURS: ["START", "FINISH"],
  ATTENDANCE: ["CLOCK_IN", "CLOCK_OUT"],
  PERMIT: ["RECTIFICATION_SUBMITTED", "RETURNED", "VERIFIED", "RESOLVED"],
};

/** Queue kinds that are a submission somebody is waiting on, and their label. */
export const QUEUED_SUBMISSION_KINDS: Record<string, string> = {
  MATERIAL_RECEIPT: "MATERIAL_RECEIPT",
  CATEGORY_EVIDENCE: "SITE_RECORD",
  SAFETY_INCIDENT: "HAZARD",
  SITE_PROGRESS: "PROGRESS",
  WASTE_OUTGOING: "WASTE_OUTGOING",
  // 现场实际退场 sent with no signal (Q29.3): waiting under its return's number.
  MATERIAL_OUTGOING_EXIT: "MATERIAL_OUTGOING",
  // JB116 (「确保全部提交都会显示」): everything else the phone queues with
  // no signal is waiting too, and says so in the same list.
  MATERIAL_OUTGOING: "MATERIAL_OUTGOING",
  EQUIPMENT_MOVEMENT: "EQUIPMENT_MOVEMENT",
  DISPOSAL_REQUEST: "DISPOSAL_REQUEST",
  SUNDRY_CLAIM: "SUNDRY_CLAIM",
  SAFETY_RECTIFICATION: "HAZARD",
  GATE_PHOTO: "GATE_INCIDENT",
  EQUIPMENT_HOURS_PHOTO: "EQUIPMENT_HOURS",
  ATTENDANCE: "ATTENDANCE",
  CONSULTANT_SUBMISSION: "CONSULTANT",
};

/**
 * The catalogue key of a row's kind name. A gate record says whether it is a
 * plain 门岗照片 or a 门岗事项; a site record sent as a 顾问申请 says so,
 * not 现场记录.
 */
export function submissionKindKey(
  row: Pick<MySubmissionRow, "kind" | "gate_issue" | "task_type">,
): string {
  if (row.kind === "GATE_INCIDENT" && row.gate_issue) return "mySubmissions.kind.GATE_ISSUE";
  if (row.kind === "SITE_RECORD" && row.task_type === "CONSULTANT") return "mySubmissions.kind.CONSULTANT";
  return `mySubmissions.kind.${row.kind}`;
}

/** A row whose record carries a conversation the sender takes part in. */
export function rowTalksAsGateIssue(row: Pick<MySubmissionRow, "kind" | "gate_issue">): boolean {
  return row.kind === "GATE_INCIDENT" && Boolean(row.gate_issue);
}
