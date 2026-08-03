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
