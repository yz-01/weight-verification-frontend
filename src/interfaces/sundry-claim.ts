/**
 * Sundry Claim / 杂费报销 (D-232, D-252). A claim of kind SUNDRY on the one
 * claim table; the fields below are the ones a sundry claim fills.
 */
export type SundryClaimState = "SUBMITTED" | "CONFIRMED" | "REJECTED";

export interface SundryClaimAttachment {
  id: string;
  image: string;
  caption: string;
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
}

export interface SundryClaimPaymentProof {
  id: string;
  file: string;
  amount: string | null;
  note: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface SundryClaim {
  id: string;
  claim_no: string;
  project: string;
  project_name: string;
  project_code: string;
  amount: string;
  description: string;
  state: SundryClaimState;
  /** RECEIVED means 已付款 for a sundry claim (the applicant received it). */
  payment_state: "NOT_RECEIVED" | "PARTIAL" | "RECEIVED";
  is_paid: boolean;
  captured_at: string | null;
  latitude: string | null;
  longitude: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  review_note: string;
  reviewed_by_name: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  paid_by_name: string | null;
  paid_by_user_id: string | null;
  paid_at: string | null;
  payment_note: string;
  attachments: SundryClaimAttachment[];
  payment_proofs: SundryClaimPaymentProof[];
  created_at: string;
  /**
   * The SUNDRY column it is filed under. The phone never chooses one; it
   * arrives 未归类 (null) and the office files it (D-275).
   */
  category: string | null;
  category_name: string | null;
}

/** What one claim looks like to a person: its decision, or paid once paid. */
export type SundryClaimStatus = SundryClaimState | "PAID";

export function sundryStatus(claim: Pick<SundryClaim, "state" | "is_paid">): SundryClaimStatus {
  return claim.is_paid ? "PAID" : claim.state;
}
