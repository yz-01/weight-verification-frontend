import type { MaterialRequest } from "@/interfaces/material-request";

/**
 * What the decision area of a material request shows to this reader (D2, Q14).
 *
 * - `decide`: approve / return.
 * - `own`: the reader raised it. Never the buttons, whatever their role -
 *   the customer's screenshot showed the applicant "test" approving his own
 *   request. The server refuses it too (`cannot_review_own_request`).
 * - `waiting`: somebody else decides it; the reader only waits.
 * - `none`: already decided.
 *
 * An unknown reader is treated as not allowed to decide: the buttons appear
 * only once we know the reader is not the applicant.
 */
export type MaterialRequestReviewView = "decide" | "own" | "waiting" | "none";

export function materialRequestReviewView(
  row: Pick<MaterialRequest, "status" | "submitted_by">,
  readerId: string | null | undefined,
  canReview: boolean,
): MaterialRequestReviewView {
  if (row.status !== "SUBMITTED") return "none";
  if (readerId && row.submitted_by === readerId) return "own";
  if (!readerId) return "waiting";
  return canReview ? "decide" : "waiting";
}
