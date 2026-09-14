import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ApprovalCredential,
  ApplicationTemplate,
  ApplicationTemplatePayload,
  ApplicationTemplateVersion,
  ApplicationVerification,
  ConsultantApplication,
  ConsultantDashboardData,
  ConsultantApplicationPayload,
  ConsultantAccountPayload,
  ConsultantGrantPayload,
  ConsultantGrantOption,
  ConsultantOrganizationOption,
  ConsultantOrganizationMember,
  ConsultantOrganizationPayload,
  ConsultantProjectAccessGrant,
  ConsultantWorkflow,
  ConsultantWorkflowStep,
  EvidenceCandidate,
  ProjectApplicationOption,
  ProjectOptionCategory,
  RemedialItem,
  WorkflowReviewerKind,
  WorkflowReviewerChoices,
} from "@/interfaces/consultant-workflow";
import type { DocumentRecord } from "@/interfaces/document-workflow";
import { api, download, toastSuccess } from "@/services/api-client";

export const getApplicationOptions = (
  project: string,
  category?: ProjectOptionCategory,
) =>
  api.list<ProjectApplicationOption>(
    "/api/consultant-application-options/get_options/",
    { project, category, page_size: 200 },
  );

export const createApplicationOption = async (payload: {
  project: string;
  category: ProjectOptionCategory;
  code: string;
  label: string;
  is_active: boolean;
  sort_order: number;
}) => {
  const row = await api.post<ProjectApplicationOption>(
    "/api/consultant-application-options/create_option/",
    payload,
  );
  toastSuccess("consultantWorkflow.toast.optionSaved");
  return row;
};

/**
 * Correct an option already in the list.
 *
 * The list is seeded once per project and then added to from the application
 * form, so a mistyped label survives every application filed after it. This
 * is the only way to fix one, and turning an option off is how a retired one
 * stops being offered without rewriting what was filed under it.
 */
export const updateApplicationOption = async (
  id: string,
  payload: Partial<Pick<ProjectApplicationOption, "label" | "is_active" | "sort_order">>,
) => {
  const row = await api.patch<ProjectApplicationOption>(
    `/api/consultant-application-options/${id}/update_option/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.optionSaved");
  return row;
};

export const getConsultantWorkflows = (query: ListQuery = {}) =>
  api.list<ConsultantWorkflow>("/api/consultant-workflows/get_workflows/", query);

export const getApplicationTemplates = (query: ListQuery = {}) =>
  api.list<ApplicationTemplate>(
    "/api/consultant-application-templates/get_templates/",
    query,
  );

export const createApplicationTemplate = async (
  payload: ApplicationTemplatePayload,
) => {
  const row = await api.post<ApplicationTemplate>(
    "/api/consultant-application-templates/create_template/",
    payload,
  );
  toastSuccess("consultantWorkflow.toast.templateSaved");
  return row;
};

export const createApplicationTemplateVersion = async (
  id: string,
  payload: Pick<ApplicationTemplatePayload, "field_schema" | "required_attachment_codes" | "report_mapping" | "change_note">,
) => {
  const row = await api.post<ApplicationTemplateVersion>(
    `/api/consultant-application-templates/${id}/create_version/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.templateVersionSaved");
  return row;
};

/**
 * Edit a template's own details - not its form.
 *
 * The fields applicants fill in are versioned separately, because changing
 * them would change what an already-filed application meant. Everything here
 * is the label on the outside: name, description, numbering, whether it is
 * still offered.
 */
export const updateApplicationTemplate = async (
  id: string,
  payload: Partial<Omit<ApplicationTemplatePayload, "project" | "field_schema" | "required_attachment_codes" | "report_mapping" | "change_note">> & {
    is_active?: boolean;
  },
) => {
  const row = await api.patch<ApplicationTemplate>(
    `/api/consultant-application-templates/${id}/update_template/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.templateSaved");
  return row;
};

export const createConsultantWorkflow = async (payload: {
  project: string;
  name: string;
  application_type: string | null;
  description: string;
  is_default: boolean;
  is_active: boolean;
}) => {
  const row = await api.post<ConsultantWorkflow>(
    "/api/consultant-workflows/create_workflow/",
    payload,
  );
  toastSuccess("consultantWorkflow.toast.workflowSaved");
  return row;
};

/**
 * Edit a workflow's own details.
 *
 * ``application_type`` is only accepted while nothing has been filed against
 * the workflow - the API answers 409 once something has, because the
 * applications already filed would otherwise describe a route that never
 * existed. The console reads ``has_applications`` and leaves the field out.
 */
export const updateConsultantWorkflow = async (
  id: string,
  payload: Partial<
    Pick<
      ConsultantWorkflow,
      "name" | "description" | "is_default" | "is_active" | "application_type"
    >
  >,
) => {
  const row = await api.patch<ConsultantWorkflow>(
    `/api/consultant-workflows/${id}/update_workflow/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.workflowSaved");
  return row;
};

export const addConsultantWorkflowStep = async (
  workflowId: string,
  payload: {
    sequence: number;
    name: string;
    reviewer_kind: WorkflowReviewerKind;
    reviewer_user?: string | null;
    reviewer_role?: string | null;
    requires_signature: boolean;
    requires_stamp: boolean;
  },
) => {
  const row = await api.post<ConsultantWorkflowStep>(
    `/api/consultant-workflows/${workflowId}/add_step/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.stepSaved");
  return row;
};

/**
 * Edit one step of an approval route.
 *
 * Refused with 409 once any application on this workflow has been submitted:
 * from that point the route is part of the record. ``steps_locked`` says so
 * ahead of time, and the console leaves the control out rather than offer a
 * button that always fails.
 */
export const updateConsultantWorkflowStep = async (
  workflowId: string,
  stepId: string,
  payload: Partial<ConsultantWorkflowStep>,
) => {
  const row = await api.patch<ConsultantWorkflowStep>(
    `/api/consultant-workflows/${workflowId}/update_step/`,
    { ...payload, step: stepId },
  );
  toastSuccess("consultantWorkflow.toast.stepSaved");
  return row;
};

export const deleteConsultantWorkflowStep = async (
  workflowId: string,
  stepId: string,
) => {
  await api.post(`/api/consultant-workflows/${workflowId}/delete_step/`, {
    step: stepId,
  });
  toastSuccess("consultantWorkflow.toast.stepRemoved");
};

export const getConsultantApplications = (
  query: ListQuery = {},
): Promise<Paginated<ConsultantApplication>> =>
  api.list<ConsultantApplication>(
    "/api/consultant-applications/get_applications/",
    query,
  );

export const getConsultantDashboard = (project?: string) =>
  api.get<ConsultantDashboardData>(
    "/api/consultant-applications/get_dashboard/",
    project ? { project } : undefined,
  );

export const getConsultantApplication = (id: string) =>
  api.get<ConsultantApplication>(
    `/api/consultant-applications/${id}/get_application/`,
  );

export const createConsultantApplication = async (
  payload: ConsultantApplicationPayload,
) => {
  const row = await api.post<ConsultantApplication>(
    "/api/consultant-applications/create_application/",
    payload,
  );
  toastSuccess("consultantWorkflow.toast.draftSaved");
  return row;
};

export const updateConsultantApplication = async (
  id: string,
  payload: Partial<ConsultantApplicationPayload>,
) => {
  const row = await api.patch<ConsultantApplication>(
    `/api/consultant-applications/${id}/update_application/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.draftSaved");
  return row;
};

export const submitConsultantApplication = async (id: string) => {
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/submit_application/`,
    {},
  );
  toastSuccess("consultantWorkflow.toast.submitted");
  return row;
};

export const receiveConsultantApplication = async (id: string) =>
  api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/receive_application/`,
    {},
  ).then((row) => {
    toastSuccess("consultantWorkflow.toast.received");
    return row;
  });

export const acknowledgeConsultantApplication = async (id: string) =>
  api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/acknowledge_application/`,
    {},
  ).then((row) => {
    toastSuccess("consultantWorkflow.toast.acknowledged");
    return row;
  });

export const reviewConsultantApplication = async (
  id: string,
  payload: {
    decision: "APPROVE" | "APPROVE_WITH_REMEDIAL" | "REJECT" | "REVISE_RESUBMIT";
    remarks: string;
    approval_pin: string;
  },
) => {
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/act/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.decisionSaved");
  return row;
};

export const createApplicationRevision = async (id: string) => {
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/create_revision/`,
    {},
  );
  toastSuccess("consultantWorkflow.toast.revisionCreated");
  return row;
};

export const addApplicationAttachment = async (
  id: string,
  file: File,
  category: string,
  note: string,
) => {
  const data = new FormData();
  data.append("file", file);
  data.append("category", category);
  data.append("note", note);
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/add_attachment/`,
    data,
  );
  toastSuccess("consultantWorkflow.toast.attachmentAdded");
  return row;
};

export const getApplicationEvidenceCandidates = (
  project: string,
  filters: { search?: string; date_from?: string; date_to?: string; kind?: string; category?: string; subcategory?: string; uploader?: string } = {},
) =>
  api.list<EvidenceCandidate>(
    "/api/consultant-applications/get_evidence_candidates/",
    { project, page_size: 500, ...filters },
  );

export const getApplicationDocumentCandidates = (project: string, search?: string) =>
  api.list<DocumentRecord>("/api/documents/get_documents/", {
    project,
    search: search || undefined,
    page_size: 100,
  });

export const linkApplicationDocumentAttachment = async (
  id: string,
  version: string,
  category?: string,
  note?: string,
) => {
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/link_document_attachment/`,
    { version, category, note },
  );
  toastSuccess("consultantWorkflow.toast.attachmentAdded");
  return row;
};

export const linkApplicationEvidence = async (
  id: string,
  evidenceIds: string[],
  caption: string,
) => {
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/link_evidence/`,
    { evidence_ids: evidenceIds, caption },
  );
  toastSuccess("consultantWorkflow.toast.evidenceLinked");
  return row;
};

/**
 * Rebuild an approval report that was decided but never archived.
 *
 * The decision is the act; the PDF is its record. When archiving fails - a
 * storage blip at the wrong second - the application sits decided with the
 * report row showing "pending" and nothing to press, which is the state the
 * archive panel now offers a way out of. The backend refuses unless the
 * decision is final and the report really is missing, so this cannot be used
 * to regenerate a report that already exists.
 */
export const retryApplicationFinalReport = async (id: string) => {
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/retry_final_report/`,
    {},
  );
  toastSuccess("consultantWorkflow.toast.reportRebuilt");
  return row;
};

export const downloadApplicationFinalReport = (id: string, applicationNo: string) =>
  download(
    `/api/consultant-applications/${id}/download_final_report/`,
    { fallbackFilename: `${applicationNo}-Final-Approval-Report.pdf` },
  );

export const getApprovalCredential = () =>
  api.get<ApprovalCredential | null>(
    "/api/approval-credentials/get_credential/",
  );

export const setApprovalCredential = async (payload: {
  currentPassword: string;
  approvalPin: string;
  signature?: File;
  stamp?: File;
}) => {
  const data = new FormData();
  data.append("current_password", payload.currentPassword);
  data.append("approval_pin", payload.approvalPin);
  if (payload.signature) data.append("signature", payload.signature);
  if (payload.stamp) data.append("stamp", payload.stamp);
  const row = await api.post<ApprovalCredential>(
    "/api/approval-credentials/set_credential/",
    data,
  );
  toastSuccess("consultantWorkflow.toast.credentialSaved");
  return row;
};

export const getConsultantGrants = (project: string) =>
  api.get<ConsultantGrantOption[]>(
    "/api/consultant-applications/get_consultant_choices/",
    { project },
  );

export const getConsultantOrganizations = () =>
  api.list<ConsultantOrganizationOption>(
    "/api/consultant-access/get_organizations/",
    { page_size: 200 },
  );

export const createConsultantOrganization = async (
  payload: ConsultantOrganizationPayload,
) => {
  const row = await api.post<ConsultantOrganizationOption>(
    "/api/consultant-access/create_organization/",
    payload,
  );
  toastSuccess("consultantAccess.toast.organizationSaved");
  return row;
};

export const updateConsultantOrganization = async (
  id: string,
  payload: Partial<ConsultantOrganizationPayload>,
) => {
  const row = await api.patch<ConsultantOrganizationOption>(
    `/api/consultant-access/${id}/update_organization/`,
    payload,
  );
  toastSuccess("consultantAccess.toast.organizationSaved");
  return row;
};

export const getConsultantMembers = (query: ListQuery = {}) =>
  api.list<ConsultantOrganizationMember>(
    "/api/consultant-access/get_consultants/",
    query,
  );

export const inviteConsultantAccount = async (
  payload: ConsultantAccountPayload,
) => {
  const row = await api.post<{
    id: string;
    email: string;
    organization_id: string;
    membership_id: string;
    reused_identity: boolean;
    invitation_sent: boolean;
    invitation_url: string;
  }>("/api/consultant-access/create_consultant/", payload);
  toastSuccess("consultantAccess.toast.consultantSaved");
  return row;
};

export const getConsultantAccessGrants = (query: ListQuery = {}) =>
  api.list<ConsultantProjectAccessGrant>(
    "/api/consultant-access/get_grants/",
    query,
  );

export const createConsultantAccessGrant = async (
  payload: ConsultantGrantPayload,
) => {
  const row = await api.post<ConsultantProjectAccessGrant>(
    "/api/consultant-access/create_grant/",
    payload,
  );
  toastSuccess("consultantAccess.toast.grantSaved");
  return row;
};

export const updateConsultantAccessGrant = async (
  id: string,
  payload: Partial<ConsultantGrantPayload>,
) => {
  const row = await api.patch<ConsultantProjectAccessGrant>(
    `/api/consultant-access/${id}/update_grant/`,
    payload,
  );
  toastSuccess("consultantAccess.toast.grantSaved");
  return row;
};

export const revokeConsultantAccessGrant = async (id: string) => {
  await api.post(`/api/consultant-access/${id}/revoke_grant/`, {});
  toastSuccess("consultantAccess.toast.grantRevoked");
};

export const getWorkflowReviewerChoices = (project: string) =>
  api.get<WorkflowReviewerChoices>(
    "/api/consultant-workflows/get_reviewer_choices/",
    { project },
  );

export const addRemedialItem = async (
  application: string,
  payload: {
    description: string;
    assigned_to?: string | null;
    due_on?: string | null;
  },
): Promise<RemedialItem> => {
  const item = await api.post<RemedialItem>(
    `/api/consultant-applications/${application}/add_remedial_item/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.remedialRaised");
  return item;
};

export const closeRemedialItem = async (
  application: string,
  payload: { item: string; closure_note: string; evidence: string[] },
): Promise<RemedialItem> => {
  const item = await api.post<RemedialItem>(
    `/api/consultant-applications/${application}/close_remedial_item/`,
    payload,
  );
  toastSuccess("consultantWorkflow.toast.remedialClosed");
  return item;
};

export const verifyConsultantApplication = (code: string) =>
  api.get<ApplicationVerification>(
    `/api/consultant-applications/verify/${encodeURIComponent(code)}/`,
  );
