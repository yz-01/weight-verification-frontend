import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ApprovalCredential,
  ApplicationVerification,
  ConsultantApplication,
  ConsultantApplicationPayload,
  ConsultantGrantOption,
  ConsultantOrganizationOption,
  ConsultantWorkflow,
  ConsultantWorkflowStep,
  EvidenceCandidate,
  ProjectApplicationOption,
  ProjectOptionCategory,
  WorkflowReviewerKind,
  WorkflowReviewerChoices,
} from "@/interfaces/consultant-workflow";
import { api, download, toastSuccess } from "@/services/api-client";

export const getApplicationOptions = (
  project: string,
  category?: ProjectOptionCategory,
) =>
  api.list<ProjectApplicationOption>(
    "/api/consultant-application-options/get_options/",
    { project, category, page_size: 200 },
  );

export const getConsultantWorkflows = (query: ListQuery = {}) =>
  api.list<ConsultantWorkflow>("/api/consultant-workflows/get_workflows/", query);

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

export const updateConsultantWorkflowStep = (
  workflowId: string,
  stepId: string,
  payload: Partial<ConsultantWorkflowStep>,
) =>
  api.patch<ConsultantWorkflowStep>(
    `/api/consultant-workflows/${workflowId}/update_step/`,
    { ...payload, step: stepId },
  );

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

export const reviewConsultantApplication = async (
  id: string,
  payload: {
    decision: "APPROVE" | "REJECT" | "REVISE_RESUBMIT";
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

export const getApplicationEvidenceCandidates = (project: string) =>
  api.list<EvidenceCandidate>(
    "/api/consultant-applications/get_evidence_candidates/",
    { project, page_size: 200 },
  );

export const linkApplicationEvidence = async (
  id: string,
  evidence: string,
  caption: string,
) => {
  const row = await api.post<ConsultantApplication>(
    `/api/consultant-applications/${id}/link_evidence/`,
    { evidence, caption },
  );
  toastSuccess("consultantWorkflow.toast.evidenceLinked");
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

export const getWorkflowReviewerChoices = (project: string) =>
  api.get<WorkflowReviewerChoices>(
    "/api/consultant-workflows/get_reviewer_choices/",
    { project },
  );

export const verifyConsultantApplication = (code: string) =>
  api.get<ApplicationVerification>(
    `/api/consultant-applications/verify/${encodeURIComponent(code)}/`,
  );
