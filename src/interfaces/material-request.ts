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

export interface MaterialRequestDecision {
  id: string;
  decision: Exclude<MaterialRequestStatus, "SUBMITTED">;
  note: string;
  decided_by_name: string | null;
  decided_at: string;
}

export interface MaterialRequest {
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
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string;
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
  client_event_id?: string;
  attachments: File[];
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
