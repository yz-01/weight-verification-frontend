import type { MaterialRequest } from "@/interfaces/material-request";

/**
 * What the decision area of a material request shows to this reader (D2, Q14, Q15).
 *
 * - `decide`: approve / return - the person it was sent to (「提交给」), or
 *   any approver on a request from before D2 that names nobody.
 * - `takeOver`: an approver it was not sent to. 「改派给我」 first; the
 *   server refuses their approve / return until then
 *   (`material_request_assigned_to_other`), and the history keeps the take-over.
 * - `own`: the reader raised it. Never the buttons, whatever their role -
 *   the customer's screenshot showed the applicant "test" approving his own
 *   request. The server refuses it too (`cannot_review_own_request`).
 * - `waiting`: somebody else decides it; the reader only waits.
 * - `manager`: the project manager a site staff's request was sent to first
 *   (I12, ID29) - 「转呈总部」 or return; never approve. While his account is
 *   suspended or stopped, head office gets `decide` instead - 「总部代批」
 *   (JB206-13, Lucas 11-16: 「总部可以代为审批」); while he is active,
 *   head office waits.
 * - `none`: already decided.
 *
 * An unknown reader is treated as not allowed to decide: the buttons appear
 * only once we know the reader is not the applicant.
 */
export type MaterialRequestReviewView = "decide" | "takeOver" | "own" | "waiting" | "manager" | "none";

export function materialRequestReviewView(
  row: Pick<MaterialRequest, "status" | "submitted_by"> &
    Partial<Pick<MaterialRequest, "assigned_reviewer" | "awaiting_manager" | "assigned_reviewer_active">>,
  readerId: string | null | undefined,
  canReview: boolean,
): MaterialRequestReviewView {
  if (row.status !== "SUBMITTED") return "none";
  if (readerId && row.submitted_by === readerId) return "own";
  // With the project manager first (I12, ID29): theirs to send on; head
  // office and everybody else wait for it.
  if (row.awaiting_manager) {
    if (readerId && row.assigned_reviewer === readerId) return "manager";
    return readerId && canReview && row.assigned_reviewer_active === false ? "decide" : "waiting";
  }
  if (!readerId || !canReview) return "waiting";
  if (row.assigned_reviewer && row.assigned_reviewer !== readerId) return "takeOver";
  return "decide";
}

/**
 * Who 「提交给」 sends the request to (Q15): the only person on the list when
 * there is one - chosen for the applicant - otherwise the applicant's own
 * choice, and only while it is still on this project's list (the project
 * changed, or a draft outlived somebody's permission).
 */
export function chosenReviewer(rows: readonly { id: string }[], picked: string | null | undefined): string {
  if (rows.length === 1) return rows[0].id;
  return picked && rows.some((row) => row.id === picked) ? picked : "";
}

/**
 * Whether this reader may 修改 / 删除 the request at all: the person who
 * raised it or an approver (`material_request.review`) - the server's own
 * rule (`_changeable`), so a project manager at his 转呈 stage, or a project
 * user on a decided request, no longer types a whole change only to be
 * refused. JB206-2 (Lucas 11-16 audit).
 */
export function mayChangeMaterialRequest(
  row: Pick<MaterialRequest, "submitted_by">,
  readerId: string | null | undefined,
  can: (code: string) => boolean,
): boolean {
  return Boolean(readerId && row.submitted_by === readerId) || can("material_request.review");
}

/**
 * 「总部代批」 (JB206-13): head office deciding a request at the stage of a
 * project manager who is away. The detail says so above the buttons, and
 * the history keeps it.
 */
export function decidesForAwayManager(
  row: Partial<Pick<MaterialRequest, "awaiting_manager">>,
  view: MaterialRequestReviewView,
): boolean {
  return Boolean(row.awaiting_manager) && view === "decide";
}

/**
 * Whose desk a waiting request is on, in words: 「等待 XXX 审批」, or - still
 * with the project manager (ID29) - 「待项目经理 XXX 确认」, so head office
 * knows it is not theirs yet. `null` when it names nobody (a request from
 * before D2). JB206-8 (Lucas 11-16 audit).
 */
export function materialRequestWaiting(
  row: Pick<MaterialRequest, "assigned_reviewer_name"> & Partial<Pick<MaterialRequest, "awaiting_manager">>,
): { key: "waitingFor" | "waitingForManager"; name: string } | null {
  if (!row.assigned_reviewer_name) return null;
  return {
    key: row.awaiting_manager ? "waitingForManager" : "waitingFor",
    name: row.assigned_reviewer_name,
  };
}
