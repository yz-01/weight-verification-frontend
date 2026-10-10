/** Document archive and approval workflow API calls. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  AddSystemFilesPayload,
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
  DocumentSystemFileInfo,
  DocumentVersion,
  SystemFile,
  WorkflowStep,
  WorkflowStepPayload,
  WorkflowTemplate,
  WorkflowTemplateDetail,
  WorkflowTemplatePayload,
} from "@/interfaces/document-workflow";
import { api, download, fetchObjectUrl, toastSuccess } from "@/services/api-client";

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

/**
 * File one document with its first version in one step (B28): the file, its
 * category / subcategory path and its project together.
 */
export async function uploadDocument(
  payload: DocumentPayload & { note?: string },
  file: File,
  { quiet = false }: { quiet?: boolean } = {},
): Promise<DocumentDetail> {
  const body = new FormData();
  body.append("file", file);
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    // A form cannot send null: empty means "none" (company-wide, no subcategory).
    body.append(key, value === null ? "" : String(value));
  }
  const document = await api.post<DocumentDetail>("/api/documents/create_document/", body);
  if (!quiet) toastSuccess("documents.toast.uploaded");
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

/**
 * Add a file to a document - a new version, or one more file beside the
 * others; a document picked from the system takes them too (2026-10-10).
 */
export async function uploadDocumentVersion(
  id: string,
  file: File,
  note: string,
  { quiet = false }: { quiet?: boolean } = {},
): Promise<DocumentVersion> {
  const body = new FormData();
  body.append("file", file);
  body.append("note", note);
  const version = await api.post<DocumentVersion>(
    `/api/documents/${id}/upload_version/`,
    body,
  );
  if (!quiet) toastSuccess("documents.toast.versionUploaded");
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

/** One version, fetched to show in the page (B27); the caller revokes it. */
export function documentVersionObjectUrl(version: DocumentVersion): Promise<string> {
  return fetchObjectUrl(`/api/document-versions/${version.id}/download/`, {
    query: { inline: "1" },
  });
}

/**
 * One photograph, fetched for the table's thumbnail (D5); the caller revokes
 * it. Silent: a thumbnail that fails keeps its icon, and a page of them must
 * not stack up a toast per row.
 */
export function documentVersionThumbnailUrl(versionId: string): Promise<string> {
  return fetchObjectUrl(`/api/document-versions/${versionId}/download/`, {
    query: { inline: "1" },
    silent: true,
  });
}

/**
 * Files already in the system this reader may file here (E4). The server
 * returns only what the reader could already open.
 */
export function searchSystemFiles(query: ListQuery): Promise<Paginated<SystemFile>> {
  return api.list<SystemFile>("/api/documents/search_system_files/", query);
}

/**
 * File picked system files into a category - as references, not copies (Q23).
 * The files picked together become one document (2026-10-10); the answer is
 * that document, as a one-row list.
 */
export async function addSystemFiles(payload: AddSystemFilesPayload): Promise<DocumentRecord[]> {
  const rows = await api.post<DocumentRecord[]>("/api/documents/add_system_files/", payload);
  toastSuccess("documents.toast.systemFilesAdded");
  return rows;
}

/**
 * Add picked system files to one existing document - a row's 添加文件
 * (2026-10-10). References only; the files and their records are untouched.
 */
export async function attachSystemFiles(documentId: string, files: string[]): Promise<DocumentDetail> {
  const document = await api.post<DocumentDetail>(
    `/api/documents/${documentId}/attach_system_files/`,
    { files },
  );
  toastSuccess("documents.toast.systemFilesAdded");
  return document;
}

/** One file a document holds from the system, to show in the page. */
export function systemFileObjectUrl(documentId: string, file?: DocumentSystemFileInfo): Promise<string> {
  return fetchObjectUrl(`/api/documents/${documentId}/open_system_file/`, {
    query: file?.id ? { inline: "1", file: file.id } : { inline: "1" },
  });
}

export function downloadSystemFile(document: DocumentRecord, file?: DocumentSystemFileInfo): Promise<void> {
  const chosen = file ?? document.system_file ?? null;
  return download(`/api/documents/${document.id}/open_system_file/`, {
    query: chosen?.id ? { file: chosen.id } : undefined,
    fallbackFilename: chosen?.file_name ?? document.title,
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
