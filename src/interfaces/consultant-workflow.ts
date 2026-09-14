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
  /** Something has been filed here, so the project and type are fixed. */
  has_applications: boolean;
  /** Something has been submitted, so the approval route is part of the record. */
  steps_locked: boolean;
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
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConsultantOrganizationPayload {
  name: string;
  registration_no?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  is_active?: boolean;
}

export interface ConsultantOrganizationMember {
  id: string;
  organization: string;
  organization_name: string;
  consultant: string;
  consultant_name: string;
  consultant_email: string;
  consultant_phone: string;
  consultant_status: "INVITED" | "ACTIVE" | "SUSPENDED";
  job_title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConsultantAccountPayload {
  organization: string;
  email: string;
  full_name: string;
  phone?: string;
  job_title?: string;
  language: "en" | "zh" | "zh-TW" | "ms";
}

export interface ConsultantProjectAccessGrant extends ConsultantGrantOption {
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultantGrantPayload {
  organization: string;
  consultant: string;
  project: string;
  permissions: string[];
  valid_from: string;
  valid_until?: string | null;
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
  | "APPROVED_WITH_REMEDIAL"
  | "REJECTED"
  | "REVISE_RESUBMIT"
  | "ARCHIVED";

export interface ApplicationAttachment {
  id: string;
  category: string;
  file: string;
  watermarked_file?: string | null;
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
  evidence_watermarked_file: string | null;
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
  status: "WAITING" | "CURRENT" | "APPROVED" | "APPROVED_WITH_REMEDIAL" | "REJECTED" | "REVISE_RESUBMIT" | "SKIPPED";
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
}

export interface ApplicationApprovalAction {
  id: string;
  step: string;
  step_name: string;
  step_sequence: number;
  decision: "APPROVE" | "APPROVE_WITH_REMEDIAL" | "REJECT" | "REVISE_RESUBMIT";
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

export interface ApplicationRelatedRecord {
  type: string;
  type_label: string;
  record_id: string;
  reference: string;
  title: string;
  date: string | null;
  created_by_name: string;
  href: string;
  source_model: string;
}

export interface ApplicationRelatedRecordGroup {
  key: string;
  label: string;
  records: ApplicationRelatedRecord[];
}

export interface ApplicationRevisionSummary {
  id: string;
  application_no: string;
  revision: number;
  status: ConsultantApplicationStatus;
  submitted_at: string | null;
  finalized_at: string | null;
  archived_at: string | null;
  final_decision: string;
  is_current: boolean;
}

/**
 * One piece of work owed after an approval given on condition.
 *
 * `is_overdue` is the server's answer, not a date comparison done here: an
 * item closed after its date is not overdue, and two screens computing that
 * rule separately is how they end up disagreeing.
 */
export interface RemedialItem {
  id: string;
  application: string;
  description: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_on: string | null;
  status: "OPEN" | "CLOSED";
  is_overdue: boolean;
  closure_note: string;
  evidence: string[];
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  created_at: string;
  updated_at: string;
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
  template_version: string | null;
  template_name: string | null;
  template_version_number: number | null;
  template_field_schema: Array<{
    key: string;
    label: string;
    required?: boolean;
    type?: string;
  }>;
  template_required_attachment_codes: string[];
  schedule_task: string | null;
  schedule_task_name: string | null;
  schedule_task_wbs: string | null;
  source_field_task: string | null;
  source_field_task_title: string | null;
  status: ConsultantApplicationStatus;
  application_date: string;
  application_type: string;
  application_type_label: string;
  application_type_custom: string;
  discipline: string;
  discipline_label: string;
  discipline_custom: string;
  /**
   * The other trades and activities this one inspection also covers. Both
   * customer forms tick a list; the single fields above are the primary
   * choice, which the reference number and the report header read.
   */
  additional_disciplines: string[];
  additional_discipline_labels: string[];
  additional_work_types: string[];
  additional_work_type_labels: string[];
  /** The zone the inspection window was agreed in, stamped at creation. */
  inspection_timezone: string;
  /** Work owed after a conditional approval, and how it was discharged. */
  remedial_items: RemedialItem[];
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
  remarks: string;
  required_at: string | null;
  inspection_start_at: string | null;
  inspection_end_at: string | null;
  drawing_no: string;
  drawing_revision: string;
  itp_no: string;
  checklist_reference: string;
  inspection_category: "R" | "S" | "W" | "H" | "";
  custom_fields: Record<string, string>;
  submitted_at: string | null;
  received_at: string | null;
  received_by: string | null;
  received_by_name: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
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
  revision_chain: ApplicationRevisionSummary[];
  related_record_groups: ApplicationRelatedRecordGroup[];
  created_at: string;
  updated_at: string;
}

export interface ConsultantDashboardRow {
  id: string;
  application_no: string;
  project: string;
  project_name: string;
  application_type: string;
  status: ConsultantApplicationStatus;
  priority: string;
  applicant_name: string;
  consultant_name: string;
  required_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  current_step: string;
  latest_decision: string;
  latest_decision_at: string | null;
}

export interface ConsultantDashboardData {
  generated_at: string;
  summary: {
    pending: number;
    draft: number;
    in_approval: number;
    final_reports: number;
    archived: number;
    today: number;
    approved: number;
    returned: number;
    due_soon: number;
  };
  pending: ConsultantDashboardRow[];
  due_soon: ConsultantDashboardRow[];
  recent_decisions: ConsultantDashboardRow[];
}

export interface EvidenceCandidate {
  id: string;
  kind: string;
  file: string;
  watermarked_file?: string | null;
  original_filename: string;
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  photographer_name: string | null;
  sha256: string;
  source_model: string;
  source_id: string;
  field_name?: string;
  project_name?: string | null;
  metadata?: Record<string, unknown>;
  watermark_text?: string;
  record_key: string;
  record_type: string;
  record_type_label: string;
  record_id: string;
  record_reference: string;
  record_title: string;
  record_date: string | null;
  record_uploader: string | null;
  category: string;
  subcategory: string;
}

export interface ConsultantApplicationPayload {
  project: string;
  workflow: string;
  template_version?: string | null;
  schedule_task?: string | null;
  source_field_task?: string | null;
  application_type: string;
  application_type_custom?: string;
  discipline: string;
  discipline_custom?: string;
  additional_disciplines?: string[];
  additional_work_types?: string[];
  work_type: string;
  work_type_custom?: string;
  priority: string;
  priority_custom?: string;
  consultant_organization: string;
  consultant: string;
  location: string;
  component: string;
  description: string;
  remarks?: string;
  required_at?: string | null;
  inspection_start_at?: string | null;
  inspection_end_at?: string | null;
  drawing_no?: string;
  drawing_revision?: string;
  itp_no?: string;
  checklist_reference?: string;
  inspection_category?: "R" | "S" | "W" | "H" | "";
  custom_fields?: Record<string, string>;
}

export interface ApplicationTemplateVersion {
  id: string;
  template: string;
  project: string;
  version: number;
  template_snapshot: Record<string, string>;
  field_schema: Array<{ key: string; label: string; required?: boolean; type?: string }>;
  required_attachment_codes: string[];
  report_mapping: Record<string, string>;
  change_note: string;
  created_at: string;
}

export interface ApplicationTemplate {
  id: string;
  project: string;
  code: string;
  name: string;
  application_type: string | null;
  application_type_label: string | null;
  description: string;
  numbering_pattern: string;
  current_version: number;
  is_active: boolean;
  versions: ApplicationTemplateVersion[];
  created_at: string;
  updated_at: string;
}

export interface ApplicationTemplatePayload {
  project: string;
  code: string;
  name: string;
  application_type?: string | null;
  description?: string;
  numbering_pattern: string;
  field_schema?: ApplicationTemplateVersion["field_schema"];
  required_attachment_codes?: string[];
  report_mapping?: Record<string, string>;
  change_note: string;
  is_active?: boolean;
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
