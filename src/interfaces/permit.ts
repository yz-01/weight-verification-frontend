/**
 * 施工准证申请 (Permit to Work), as `site_operations.permits` returns it.
 *
 * A permit is the company's own form - Word, PDF or a photo of the paper -
 * sent to a named safety manager, who approves it (signed) or returns it.
 */

import type { RecordedBy } from "@/interfaces/recorder";

/** 待审批 · 已退回 · 已批准: the three states the list filters on. */
export type PermitStatus = "RECTIFICATION_SUBMITTED" | "RETURNED" | "VERIFIED" | "RESOLVED";

export const PERMIT_STATUSES = ["RECTIFICATION_SUBMITTED", "RETURNED", "VERIFIED"] as const;

export interface PermitFile {
  id: string;
  /** 1 for the application, then one more per resubmission. */
  submission: number;
  original_name: string;
  content_type: string;
  /** What the browser can show it as; null for Word and other files. */
  preview_type: string | null;
  byte_size: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
  /** The files the decision is about (the latest submission). */
  is_current: boolean;
  /**
   * A photographed page, as the record's photo gallery draws it: the stamped
   * copy, its thumbnail, when and where. Only on the permit's own detail;
   * null for a Word, Excel or PDF file (and on the list).
   */
  photo?: {
    url: string;
    thumbnail_url: string | null;
    captured_at: string;
    latitude: string | null;
    longitude: string | null;
  } | null;
}

export interface Permit extends RecordedBy {
  id: string;
  incident_no: string;
  project: string;
  project_name: string;
  title: string;
  note: string;
  status: PermitStatus;
  applied_at: string;
  applicant: string | null;
  applicant_name: string | null;
  applicant_title: string;
  approver: string | null;
  approver_name: string | null;
  submitted_at: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_by_title: string;
  decided_at: string | null;
  review_note: string;
  signature: string;
  files: PermitFile[];
  file_names: string;
  submission: number;
  can_decide: boolean;
  can_resubmit: boolean;
  is_closed: boolean;
  /** Waits for this reader's decision (the list's 「待处理」). */
  needs_action?: boolean;
}

export interface PermitPerson {
  id: string;
  full_name: string;
  role_name?: string;
}

export interface PermitApplication {
  project: string;
  approver: string;
  note: string;
  files: File[];
  client_event_id?: string;
}
