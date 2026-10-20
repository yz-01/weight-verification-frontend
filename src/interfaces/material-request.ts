import type { MaterialSpec } from "@/interfaces/contractor-ops";
import type { RecordedBy } from "@/interfaces/recorder";

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
  /**
   * A picture's watermarked copy - what a full-size view shows (Q30.1).
   * Null for a PDF or other file, and for a picture whose stamp could not be
   * made (never shown unstamped).
   */
  watermarked?: string | null;
}

/**
 * One row of a request's history: approved, returned, or taken over by
 * another approver while it waited (`REASSIGNED`, D2 「改派」).
 */
export interface MaterialRequestDecision {
  id: string;
  /** ``FORWARDED``: the project manager sent it on to head office (I12, ID29). */
  decision: Exclude<MaterialRequestStatus, "SUBMITTED"> | "REASSIGNED" | "FORWARDED";
  note: string;
  /** On `REASSIGNED`: who took it over. */
  decided_by_name: string | null;
  decided_at: string;
  /** On `REASSIGNED`: who had it before (empty for a request from before D2). */
  previous_reviewer_name: string | null;
}

/**
 * One of a project's request types (I16, ID36): 材料申请, 设备申请 ... and what
 * the project adds. The form it uses is one of two - never one per type.
 */
export interface RequestType {
  id: string;
  project: string;
  code: string;
  name: string;
  description: string;
  form_style: RequestFormStyle;
  /** 材料申请 / 其他申请: renamed, never switched off or removed. */
  is_fixed: boolean;
  is_active: boolean;
  sort_order: number;
  /** How many requests use it - a used type is switched off, not removed. */
  request_count: number;
}

/** 材料明细 (material, spec, quantity) or 简单申请表 (subject, content, files). */
export type RequestFormStyle = "MATERIAL" | "GENERAL";

/** A material with its specifications, as the MR form offers them (I19). */
export interface CatalogueMaterial {
  id: string;
  code: string;
  name: string;
  is_fixed: boolean;
  /** 「其他材料」: the one material whose name is typed (J14-3). */
  is_other?: boolean;
  default_unit: string;
  default_unit_label: string | null;
  specs: MaterialSpec[];
}

export interface MaterialCatalogue {
  materials: CatalogueMaterial[];
  /** The company's switched-on units, for a 「其他」 specification. */
  units: { code: string; label: string | null }[];
  /** Whether the reader may add a missing material (「前往分类管理」). */
  can_manage_categories: boolean;
}

export interface MaterialRequest extends RecordedBy {
  /** The number before I6 renumbered it (「旧编号」); empty on a newer record. */
  legacy_no?: string;
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  request_no: string;
  request_type: MaterialRequestType;
  /** The project's request type (I16); null on a request no type could take. */
  request_kind: string | null;
  request_kind_name: string | null;
  request_kind_form_style: RequestFormStyle | null;
  /** 申请事项 / 申请内容 - the simple form (ID48). */
  subject: string;
  content: string;
  /** The material and specification from the material data (I19). */
  category: string | null;
  spec_category: string | null;
  /** 材料编号 (I19-15): the linked category's code; null for a request with no material. */
  category_code?: string | null;
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
  /** 「待项目经理确认」 (I12, ID29): with the project manager, not head office yet. */
  awaiting_manager?: boolean;
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

export interface MaterialRequestDraft {
  project: string;
  request_type: MaterialRequestType;
  /** The project's request type (I16); decides the form on the server too. */
  request_kind?: string;
  category?: string;
  spec_category?: string;
  subject?: string;
  content?: string;
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
  /**
   * Who the list is (I12, ID29): ``MANAGER`` - a site staff's request goes
   * to the project manager first; ``HEAD_OFFICE`` - straight to head office.
   */
  stage?: "MANAGER" | "HEAD_OFFICE";
}

/**
 * The quantity rule the server enforces (C02): above zero, at most three
 * decimal places since I19 (ID47) - the same as a delivery. Checked here too
 * so the form says so before sending.
 */
export function isValidRequestQuantity(value: string): boolean {
  const text = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return false;
  return Number(text) > 0 && Number(text) < 1e11;
}

/**
 * What a request may carry (I16, ID49), checked by extension the same way
 * the server checks it: pictures, PDF, Word, Excel, PowerPoint, CSV / TXT,
 * DWG and ZIP.
 */
export const REQUEST_ATTACHMENT_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "dwg", "zip",
] as const;

/** The file picker's `accept`, from the same list. */
export const REQUEST_ATTACHMENT_ACCEPT = REQUEST_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function isAllowedRequestAttachment(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return (REQUEST_ATTACHMENT_EXTENSIONS as readonly string[]).includes(name.slice(dot + 1).toLowerCase());
}
