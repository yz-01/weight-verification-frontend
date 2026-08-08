export type ProjectOptionCategory =
  | "APPLICATION_TYPE"
  | "DISCIPLINE"
  | "WORK_TYPE"
  | "PRIORITY"
  | "ATTACHMENT_TYPE";

export interface ProjectApplicationOption {
  id: string;
  project: string;
  category: ProjectOptionCategory;
  code: string;
  label: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export type WorkflowReviewerKind = "USER" | "ROLE" | "CONSULTANT";

export interface ConsultantWorkflowStep {
  id: string;
  workflow: string;
  project: string;
  sequence: number;
  name: string;
  reviewer_kind: WorkflowReviewerKind;
  reviewer_user: string | null;
  reviewer_user_name: string | null;
  reviewer_role: string | null;
  reviewer_role_name: string | null;
  requires_signature: boolean;
  requires_stamp: boolean;
}

export interface ConsultantWorkflow {
  id: string;
  project: string;
  project_name: string;
  name: string;
  application_type: string | null;
  application_type_label: string | null;
  description: string;
  is_default: boolean;
  is_active: boolean;
  steps: ConsultantWorkflowStep[];
  created_at: string;
  updated_at: string;
}

export interface ConsultantGrantOption {
  id: string;
  organization: string;
  organization_name: string;
  consultant: string;
  consultant_name: string;
  consultant_email: string;
  project: string;
  project_name: string;
  project_code: string;
  permissions: string[];
  is_active: boolean;
  is_current: boolean;
}

export interface ConsultantOrganizationOption {
  id: string;
  name: string;
  registration_no: string;
  is_active: boolean;
}

export interface WorkflowReviewerChoices {
  users: Array<{ id: string; name: string; role: string }>;
  roles: Array<{ id: string; name: string }>;
}

export type ConsultantApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "REVISE_RESUBMIT"
  | "ARCHIVED";

export interface ApplicationAttachment {
  id: string;
  category: string;
  file: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  note: string;
  created_at: string;
}

export interface ApplicationEvidenceLink {
  id: string;
  evidence: string;
  evidence_kind: string;
  evidence_file: string;
  original_filename: string;
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  photographer_name: string | null;
  sha256: string;
  caption: string;
  sort_order: number;
}

export interface ApplicationReviewStep {
  id: string;
  sequence: number;
  name: string;
  reviewer_kind: WorkflowReviewerKind;
  reviewer_user: string | null;
  reviewer_user_name: string | null;
  reviewer_role: string | null;
  reviewer_role_name: string | null;
  requires_signature: boolean;
  requires_stamp: boolean;
  status: "WAITING" | "CURRENT" | "APPROVED" | "REJECTED" | "REVISE_RESUBMIT" | "SKIPPED";
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
}

export interface ApplicationApprovalAction {
  id: string;
  step: string;
  step_name: string;
  step_sequence: number;
  decision: "APPROVE" | "REJECT" | "REVISE_RESUBMIT";
  remarks: string;
  acted_by: string;
  actor_name: string;
  actor_role: string;
  acted_at: string;
  signature_snapshot: string;
  stamp_snapshot: string | null;
}

export interface ApplicationArchiveEntry {
  id: string;
  kind: "APPLICATION" | "APPROVAL" | "FINAL_REPORT";
  title: string;
  file: string | null;
  sha256: string;
  archived_at: string;
}

export interface ConsultantApplication {
  id: string;
  application_no: string;
  root_reference: string;
  revision: number;
  previous_revision: string | null;
  company_name: string;
  project: string;
  project_name: string;
  project_address: string;
  workflow: string | null;
  workflow_name: string | null;
  status: ConsultantApplicationStatus;
  application_date: string;
  application_type: string;
  application_type_label: string;
  application_type_custom: string;
  discipline: string;
  discipline_label: string;
  discipline_custom: string;
  work_type: string;
  work_type_label: string;
  work_type_custom: string;
  priority: string;
  priority_label: string;
  priority_custom: string;
  applicant_name: string;
  consultant_organization: string;
  consultant_organization_name: string;
  consultant: string;
  consultant_name: string;
  location: string;
  component: string;
  description: string;
  required_at: string | null;
  drawing_no: string;
  drawing_revision: string;
  itp_no: string;
  checklist_reference: string;
  inspection_category: "R" | "S" | "W" | "H" | "";
  custom_fields: Record<string, string>;
  submitted_at: string | null;
  finalized_at: string | null;
  archived_at: string | null;
  final_decision: string;
  final_remarks: string;
  final_report: string | null;
  final_report_sha256: string;
  verification_code: string;
  is_locked: boolean;
  attachments: ApplicationAttachment[];
  evidence_links: ApplicationEvidenceLink[];
  review_steps: ApplicationReviewStep[];
  approval_actions: ApplicationApprovalAction[];
  archive_entries: ApplicationArchiveEntry[];
  created_at: string;
  updated_at: string;
}

export interface EvidenceCandidate {
  id: string;
  kind: string;
  file: string;
  original_filename: string;
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  photographer_name: string | null;
  sha256: string;
}

export interface ConsultantApplicationPayload {
  project: string;
  workflow: string;
  application_type: string;
  application_type_custom?: string;
  discipline: string;
  discipline_custom?: string;
  work_type: string;
  work_type_custom?: string;
  priority: string;
  priority_custom?: string;
  consultant_organization: string;
  consultant: string;
  location: string;
  component: string;
  description: string;
  required_at?: string | null;
  drawing_no?: string;
  drawing_revision?: string;
  itp_no?: string;
  checklist_reference?: string;
  inspection_category?: "R" | "S" | "W" | "H" | "";
  custom_fields?: Record<string, string>;
}

export interface ApprovalCredential {
  signature: string;
  stamp: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationVerification {
  application_no: string;
  revision: number;
  company_name: string;
  project_name: string;
  application_type: string;
  consultant_company: string;
  consultant_name: string;
  decision: string;
  finalized_at: string;
  sha256: string;
  verification_code: string;
}
