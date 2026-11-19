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
   * The file as a picture on a list (J34-10): a photograph's thumbnail, a
   * PDF's first page, a Word or Excel preview; null when there is none.
   */
  thumbnail_url?: string | null;
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
  /** The number before I6 renumbered it (「旧编号」); empty on a newer record. */
  legacy_no?: string;
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
  /** The 电子准证 (JB216), or null until somebody saved one. */
  work_form?: PermitWorkForm | null;
  /** Whether this reader may fill it now: who may 签名批准 it, in the office. */
  can_fill_work_form?: boolean;
  /** 「施工事项名称」 (JB221): written by the safety manager; "" until then. */
  work_name?: string;
  /**
   * The 「附件」 that count as the 正式施工准证 (JB221): uploaded in the office
   * by anybody but the applicant, a Word / Excel / PDF / photo. On the
   * permit's own window; `null` on the list.
   */
  formal_permit_files?: PermitFormalFile[] | null;
}

/** One 「附件」 that is the formal permit (JB221). */
export interface PermitFormalFile {
  id: string;
  original_name: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

/**
 * The 电子准证 (JB216, 客户 11-18 事项 1, 图 2): only what the application does
 * not hold. The project, applicant, date, photos, files, 审批意见, signature
 * and time are read from the permit itself.
 */
export interface PermitWorkForm {
  /** 准证编号, `PTW-<project>-NNN`, given on the first save. */
  permit_no: string;
  subcontractor: string;
  work_lead: string;
  contact_phone: string;
  /** 施工类别: the words chosen, kept as they were saved. */
  work_type: string;
  location: string;
  work_content: string;
  work_start: string | null;
  work_end: string | null;
  safety_measures: string;
  approval_conditions: string;
  valid_from: string | null;
  valid_until: string | null;
  filled_by_name: string | null;
  filled_at: string | null;
}

export type PermitWorkFormInput = Omit<PermitWorkForm, "permit_no" | "filled_by_name" | "filled_at"> & {
  /**
   * When the e-permit this screen opened was last saved (null: none yet).
   * Somebody else saving in between is told, never silently overwritten.
   */
  seen_saved_at?: string | null;
};

/** One of the company's 施工类别 (分类管理 → 施工准证 · 施工类别). */
export interface PermitWorkType {
  id: string;
  /** In the reader's language while it is still a starting type nobody renamed. */
  name: string;
  is_preset_name: boolean;
  sort_order: number;
}

export interface PermitPerson {
  id: string;
  full_name: string;
  role_name?: string;
  role_code?: string;
}

export interface PermitApplication {
  project: string;
  approver: string;
  note: string;
  files: File[];
  client_event_id?: string;
}
