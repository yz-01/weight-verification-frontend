/** Shared document archive and approval workflow contracts. */

export interface DocumentCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  /** Documents filed under this category, company-wide (D-125, D-126). */
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentSubcategory {
  id: string;
  category: string;
  category_name: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document: string;
  version_number: number;
  file: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  note: string;
  created_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export type DocumentStatus = "ACTIVE" | "ARCHIVED";

export interface DocumentRecord {
  id: string;
  document_no: string;
  reference_no: string;
  title: string;
  description: string;
  keywords: string;
  project: string | null;
  project_name: string | null;
  category: string;
  category_name: string;
  subcategory: string | null;
  subcategory_name: string | null;
  status: DocumentStatus;
  /** Present on list/detail queries; create responses may omit the annotation. */
  version_count?: number;
  latest_version: DocumentVersion | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentRecord {
  versions: DocumentVersion[];
}

export interface DocumentCategoryPayload {
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface DocumentSubcategoryPayload {
  category: string;
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface DocumentPayload {
  reference_no?: string;
  title: string;
  description?: string;
  keywords?: string;
  project?: string | null;
  category: string;
  subcategory?: string | null;
}

export type ApprovalStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "RETURNED"
  | "CLOSED";

export type ApprovalActionType =
  | "SUBMIT"
  | "REVIEW"
  | "APPROVE"
  | "REJECT"
  | "RETURN"
  | "CLOSE";

export interface ApprovalAction {
  id: string;
  sequence: number;
  action: ApprovalActionType;
  from_status: ApprovalStatus;
  to_status: ApprovalStatus;
  comment: string;
  metadata: Record<string, unknown>;
  acted_by: string;
  acted_by_name: string;
  created_at: string;
}

export interface ApprovalRecord {
  id: string;
  approval_no: string;
  resource_type: string;
  resource_id: string;
  resource_label: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  project: string | null;
  project_name: string | null;
  status: ApprovalStatus;
  requested_by: string;
  requested_by_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  closed_at: string | null;
  /** Present on list/detail queries; create responses may omit the annotation. */
  action_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalDetail extends ApprovalRecord {
  actions: ApprovalAction[];
}

export interface ApprovalPayload {
  resource_type: string;
  resource_id: string;
  resource_label?: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  project?: string | null;
  assigned_to?: string | null;
}

export interface ApprovalTransitionPayload {
  action: ApprovalActionType;
  comment?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalHistory {
  count: number;
  results: ApprovalAction[];
}

/**
 * One rung of an approval chain.
 *
 * A step names either a specific reviewer or a role, never both. With no
 * template configured at all the backend falls back to "anyone holding the
 * review permission may approve, in one step" — which is why a chain that
 * exists only in the customer's expectations looks like it is working.
 */
export interface WorkflowStep {
  id: string;
  template: string;
  sequence: number;
  name: string;
  reviewer_user: string | null;
  reviewer_user_name: string | null;
  reviewer_role: string | null;
  reviewer_role_name: string | null;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStepPayload {
  sequence: number;
  name: string;
  reviewer_user?: string | null;
  reviewer_role?: string | null;
  is_required?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  resource_type: string;
  description: string;
  project: string | null;
  project_name: string | null;
  version: number;
  is_active: boolean;
  step_count?: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateDetail extends WorkflowTemplate {
  steps: WorkflowStep[];
}

export interface WorkflowTemplatePayload {
  name: string;
  resource_type: string;
  description?: string;
  project?: string | null;
  version?: number;
  is_active?: boolean;
}
