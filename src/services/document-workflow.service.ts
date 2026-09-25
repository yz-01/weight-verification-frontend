/** Document archive and approval workflow API calls. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ApprovalDetail,
  ApprovalHistory,
  ApprovalPayload,
  ApprovalRecord,
  ApprovalTransitionPayload,
  DocumentCategory,
  DocumentCategoryPayload,
  DocumentDetail,
  DocumentPayload,
  DocumentRecord,
  DocumentSubcategory,
  DocumentSubcategoryPayload,
  DocumentVersion,
  WorkflowStep,
  WorkflowStepPayload,
  WorkflowTemplate,
  WorkflowTemplateDetail,
  WorkflowTemplatePayload,
} from "@/interfaces/document-workflow";
import { api, download, toastSuccess } from "@/services/api-client";

export function getDocumentCategories(
  query: ListQuery,
): Promise<Paginated<DocumentCategory>> {
  return api.list<DocumentCategory>(
    "/api/document-categories/get_document_categories/",
    query,
  );
}

export async function createDocumentCategory(
  payload: DocumentCategoryPayload,
): Promise<DocumentCategory> {
  const category = await api.post<DocumentCategory>(
    "/api/document-categories/create_document_category/",
    payload,
  );
  toastSuccess("documents.toast.categoryCreated");
  return category;
}

export async function updateDocumentCategory(
  id: string,
  payload: Partial<DocumentCategoryPayload>,
): Promise<DocumentCategory> {
  const category = await api.patch<DocumentCategory>(
    `/api/document-categories/${id}/update_document_category/`,
    payload,
  );
  toastSuccess("documents.toast.categoryUpdated");
  return category;
}

/**
 * Remove a document category (T-384, D-264).
 *
 * Refused by the server while documents are still filed under it, with a
 * sentence naming them that the caller shows as it is.
 */
export async function deleteDocumentCategory(id: string): Promise<void> {
  await api.delete(`/api/document-categories/${id}/delete_document_category/`);
  toastSuccess("contractorOps.toast.removed");
}

export function getDocumentSubcategories(
  query: ListQuery,
): Promise<Paginated<DocumentSubcategory>> {
  return api.list<DocumentSubcategory>(
    "/api/document-subcategories/get_document_subcategories/",
    query,
  );
}

export async function createDocumentSubcategory(
  payload: DocumentSubcategoryPayload,
): Promise<DocumentSubcategory> {
  const subcategory = await api.post<DocumentSubcategory>(
    "/api/document-subcategories/create_document_subcategory/",
    payload,
  );
  toastSuccess("documents.toast.subcategoryCreated");
  return subcategory;
}

export async function updateDocumentSubcategory(
  id: string,
  payload: Partial<DocumentSubcategoryPayload>,
): Promise<DocumentSubcategory> {
  const subcategory = await api.patch<DocumentSubcategory>(
    `/api/document-subcategories/${id}/update_document_subcategory/`,
    payload,
  );
  toastSuccess("documents.toast.subcategoryUpdated");
  return subcategory;
}

export function getDocuments(
  query: ListQuery,
): Promise<Paginated<DocumentRecord>> {
  return api.list<DocumentRecord>("/api/documents/get_documents/", query);
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return api.get<DocumentDetail>(`/api/documents/${id}/get_document/`);
}

export async function createDocument(
  payload: DocumentPayload,
): Promise<DocumentDetail> {
  const document = await api.post<DocumentDetail>(
    "/api/documents/create_document/",
    payload,
  );
  toastSuccess("documents.toast.created");
  return document;
}

export async function updateDocument(
  id: string,
  payload: Partial<DocumentPayload>,
): Promise<DocumentDetail> {
  const document = await api.patch<DocumentDetail>(
    `/api/documents/${id}/update_document/`,
    payload,
  );
  toastSuccess("documents.toast.updated");
  return document;
}

export async function uploadDocumentVersion(
  id: string,
  file: File,
  note: string,
): Promise<DocumentVersion> {
  const body = new FormData();
  body.append("file", file);
  body.append("note", note);
  const version = await api.post<DocumentVersion>(
    `/api/documents/${id}/upload_version/`,
    body,
  );
  toastSuccess("documents.toast.versionUploaded");
  return version;
}

export async function archiveDocument(
  id: string,
  reason: string,
): Promise<DocumentDetail> {
  const document = await api.post<DocumentDetail>(
    `/api/documents/${id}/archive_document/`,
    { reason },
  );
  toastSuccess("documents.toast.archived");
  return document;
}

export function downloadDocumentVersion(version: DocumentVersion): Promise<void> {
  return download(`/api/document-versions/${version.id}/download/`, {
    fallbackFilename: version.original_name,
  });
}

export function getApprovals(
  query: ListQuery,
): Promise<Paginated<ApprovalRecord>> {
  return api.list<ApprovalRecord>("/api/approvals/get_approvals/", query);
}

export function getApproval(id: string): Promise<ApprovalDetail> {
  return api.get<ApprovalDetail>(`/api/approvals/${id}/get_approval/`);
}

export function getApprovalHistory(id: string): Promise<ApprovalHistory> {
  return api.get<ApprovalHistory>(`/api/approvals/${id}/get_history/`);
}

export async function createApproval(
  payload: ApprovalPayload,
): Promise<ApprovalDetail> {
  const approval = await api.post<ApprovalDetail>(
    "/api/approvals/create_approval/",
    payload,
  );
  toastSuccess("approvals.toast.created");
  return approval;
}

export async function updateApproval(
  id: string,
  payload: Partial<ApprovalPayload>,
): Promise<ApprovalDetail> {
  const approval = await api.patch<ApprovalDetail>(
    `/api/approvals/${id}/update_approval/`,
    payload,
  );
  toastSuccess("approvals.toast.updated");
  return approval;
}

export async function actOnApproval(
  id: string,
  payload: ApprovalTransitionPayload,
): Promise<ApprovalDetail> {
  const approval = await api.post<ApprovalDetail>(
    `/api/approvals/${id}/act/`,
    payload,
  );
  toastSuccess(`approvals.toast.${payload.action.toLowerCase()}`);
  return approval;
}

/**
 * Approval chain templates.
 *
 * Every one of these endpoints already existed; nothing in the product called
 * them, so a chain could not be configured and every approval quietly ran as a
 * single step. These are what the configuration screen uses.
 */
export function getWorkflowTemplates(
  query: ListQuery = {},
): Promise<Paginated<WorkflowTemplate>> {
  return api.list<WorkflowTemplate>(
    "/api/workflow-templates/get_workflow_templates/",
    query,
  );
}

export function getWorkflowTemplate(id: string): Promise<WorkflowTemplateDetail> {
  return api.get<WorkflowTemplateDetail>(
    `/api/workflow-templates/${id}/get_workflow_template/`,
  );
}

export async function createWorkflowTemplate(payload: WorkflowTemplatePayload) {
  const row = await api.post<WorkflowTemplateDetail>(
    "/api/workflow-templates/create_workflow_template/",
    payload,
  );
  toastSuccess("approvals.toast.templateSaved");
  return row;
}

export async function updateWorkflowTemplate(
  id: string,
  payload: Partial<WorkflowTemplatePayload>,
) {
  const row = await api.patch<WorkflowTemplateDetail>(
    `/api/workflow-templates/${id}/update_workflow_template/`,
    payload,
  );
  toastSuccess("approvals.toast.templateSaved");
  return row;
}

export async function deleteWorkflowTemplate(id: string) {
  await api.delete(`/api/workflow-templates/${id}/delete_workflow_template/`);
  toastSuccess("approvals.toast.templateRemoved");
}

export async function addWorkflowStep(
  templateId: string,
  payload: WorkflowStepPayload,
) {
  const row = await api.post<WorkflowStep>(
    `/api/workflow-templates/${templateId}/add_step/`,
    payload,
  );
  toastSuccess("approvals.toast.stepSaved");
  return row;
}

/**
 * Edit one step of a template in place.
 *
 * The step is named by a `step` key, not `id` - the same shape
 * `deleteWorkflowStep` uses, because the template is already the URL's
 * subject and the body has to say *which* of its steps. This function sent
 * `id` until the first screen actually called it, at which point the API
 * answered 404 every time (F-148). Nothing had caught it, because nothing had
 * ever run it.
 */
export async function updateWorkflowStep(
  templateId: string,
  payload: WorkflowStepPayload & { id: string },
) {
  const { id, ...fields } = payload;
  const row = await api.patch<WorkflowStep>(
    `/api/workflow-templates/${templateId}/update_step/`,
    { step: id, ...fields },
  );
  toastSuccess("approvals.toast.stepSaved");
  return row;
}

export async function deleteWorkflowStep(templateId: string, stepId: string) {
  await api.post(`/api/workflow-templates/${templateId}/delete_step/`, {
    step: stepId,
  });
  toastSuccess("approvals.toast.stepRemoved");
}
