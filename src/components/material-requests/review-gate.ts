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
 * - `none`: already decided.
 *
 * An unknown reader is treated as not allowed to decide: the buttons appear
 * only once we know the reader is not the applicant.
 */
export type MaterialRequestReviewView = "decide" | "takeOver" | "own" | "waiting" | "none";

export function materialRequestReviewView(
  row: Pick<MaterialRequest, "status" | "submitted_by"> & Partial<Pick<MaterialRequest, "assigned_reviewer">>,
  readerId: string | null | undefined,
  canReview: boolean,
): MaterialRequestReviewView {
  if (row.status !== "SUBMITTED") return "none";
  if (readerId && row.submitted_by === readerId) return "own";
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
