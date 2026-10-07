/**
 * MR / Other Request (C01–C07). Endpoints in
 * `contractor_ops/material_requests.py`.
 */
export type MaterialRequestType = "MATERIAL" | "OTHER";

/** Pending, then one of two ends. Returned is finished, never "waiting" (Q1). */
export type MaterialRequestStatus = "SUBMITTED" | "APPROVED" | "RETURNED";

export const MATERIAL_REQUEST_STATUSES: readonly MaterialRequestStatus[] = [
  "SUBMITTED",
  "APPROVED",
  "RETURNED",
];

export interface MaterialRequestAttachment {
  id: string;
  file: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  is_image: boolean;
}

/**
 * One row of a request's history: approved, returned, or taken over by
 * another approver while it waited (`REASSIGNED`, D2 「改派」).
 */
export interface MaterialRequestDecision {
  id: string;
  decision: Exclude<MaterialRequestStatus, "SUBMITTED"> | "REASSIGNED";
  note: string;
  /** On `REASSIGNED`: who took it over. */
  decided_by_name: string | null;
  decided_at: string;
  /** On `REASSIGNED`: who had it before (empty for a request from before D2). */
  previous_reviewer_name: string | null;
}

export interface MaterialRequest {
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  request_no: string;
  request_type: MaterialRequestType;
  status: MaterialRequestStatus;
  project: string;
  project_name: string;
  project_code: string;
  material_name: string;
  specification: string;
  quantity: string | null;
  unit: string;
  remark: string;
  /**
   * Who to buy from and whose make (2026-10 D1, D2): the applicant may
   * suggest them, approving settles both.
   */
  supplier?: string | null;
  supplier_name?: string | null;
  manufacturer?: string | null;
  manufacturer_name?: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string;
  /** 「提交给」 (D2): the one person who approves it. Empty on requests from before D2. */
  assigned_reviewer: string | null;
  assigned_reviewer_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string;
  attachments: MaterialRequestAttachment[];
  attachment_count: number;
  decisions: MaterialRequestDecision[];
  created_at: string;
}

/** One group of the totals (C04): approved and pending are never added. */
export interface MaterialRequestTotal {
  project: string;
  project_code: string;
  project_name: string;
  material_name: string;
  specification: string;
  unit: string;
  approved_quantity: string;
  pending_quantity: string;
  approved_count: number;
  pending_count: number;
  returned_count: number;
}

export type MaterialRequestOptionKind = "MATERIAL" | "SPECIFICATION" | "UNIT";

export interface MaterialRequestOption {
  id: string;
  kind: MaterialRequestOptionKind;
  name: string;
  parent: string | null;
  parent_name: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface MaterialRequestOptions {
  options: MaterialRequestOption[];
  /** The receipt units every company has (TONNE, KG, M3, ...). */
  built_in_units: string[];
}

export interface MaterialRequestDraft {
  project: string;
  request_type: MaterialRequestType;
  material_name?: string;
  specification?: string;
  quantity?: string;
  unit?: string;
  remark?: string;
  /** 「提交给」 (D2): required by the server. */
  assigned_reviewer?: string;
  /** Whose make, suggested (2026-10 D1); the approver settles it. */
  manufacturer?: string;
  client_event_id?: string;
  attachments: File[];
}

/** Somebody 「提交给」 may name: holds the approval permission on this project, never the applicant. */
export interface MaterialRequestReviewerOption {
  id: string;
  full_name: string;
}

/**
 * The quantity rule the server enforces (C02): above zero, at most two
 * decimal places. Checked here too so the form says so before sending.
 */
export function isValidRequestQuantity(value: string): boolean {
  const text = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return false;
  return Number(text) > 0;
}
