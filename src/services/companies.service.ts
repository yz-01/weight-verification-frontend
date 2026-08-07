/** Tenant company management. Platform staff only. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CompanyDetail,
  CompanyBankAccount,
  CompanyBankAccountPayload,
  CompanyDocument,
  CompanyDocumentType,
  CompanyOnboarding,
  CompanyPayload,
  CompanyReviewPayload,
  CompanyRow,
  CompanyStatusPayload,
  CompanySummary,
  SubscriptionPlan,
} from "@/interfaces/company";
import { api, toastSuccess } from "@/services/api-client";

function companyBody(payload: Partial<CompanyPayload>): Partial<CompanyPayload> | FormData {
  if (!(payload.logo instanceof File)) return payload;
  const body = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    body.append(key, value instanceof File ? value : String(value));
  }
  return body;
}

export function getCompanies(query: ListQuery): Promise<Paginated<CompanyRow>> {
  return api.list<CompanyRow>("/api/companies/get_companies/", query);
}

export function getCompany(id: string): Promise<CompanyDetail> {
  return api.get<CompanyDetail>(`/api/companies/${id}/get_company/`);
}

export async function createCompany(
  payload: CompanyPayload,
): Promise<CompanyDetail> {
  const company = await api.post<CompanyDetail>(
    "/api/companies/create_company/",
    companyBody(payload),
  );
  toastSuccess("companies.toast.created");
  return company;
}

export async function updateCompany(
  id: string,
  payload: Partial<CompanyPayload>,
): Promise<CompanyDetail> {
  const company = await api.patch<CompanyDetail>(
    `/api/companies/${id}/update_company/`,
    companyBody(payload),
  );
  toastSuccess("companies.toast.updated");
  return company;
}

export async function updateCompanyStatus(
  id: string,
  payload: CompanyStatusPayload,
): Promise<CompanyDetail> {
  const company = await api.post<CompanyDetail>(
    `/api/companies/${id}/update_company_status/`,
    payload,
  );
  toastSuccess("companies.toast.statusUpdated");
  return company;
}

export async function deleteCompany(id: string): Promise<void> {
  await api.delete(`/api/companies/${id}/delete_company/`);
  toastSuccess("companies.toast.removed");
}

export function getCompanySummary(): Promise<CompanySummary> {
  return api.get<CompanySummary>("/api/companies/get_summary/");
}

export function getSubscriptionPlans(
  audience?: "CONTRACTOR" | "RECYCLER",
): Promise<Paginated<SubscriptionPlan>> {
  return api.list<SubscriptionPlan>("/api/subscription-plans/get_plans/", {
    is_active: true,
    audience,
    page_size: 100,
  });
}

export async function reviewCompany(
  id: string,
  payload: CompanyReviewPayload,
): Promise<CompanyDetail> {
  const company = await api.post<CompanyDetail>(
    `/api/companies/${id}/review_company/`,
    payload,
  );
  toastSuccess("companies.toast.updated");
  return company;
}

export function getCompanyOnboarding(id: string): Promise<CompanyOnboarding> {
  return api.get<CompanyOnboarding>(`/api/companies/${id}/get_onboarding/`);
}

export async function uploadCompanyDocument(
  company: string,
  documentType: CompanyDocumentType,
  file: File,
  details: { title?: string; reference_no?: string; issued_on?: string; expires_on?: string } = {},
): Promise<CompanyDocument> {
  const body = new FormData();
  body.append("company", company);
  body.append("document_type", documentType);
  body.append("file", file);
  for (const [key, value] of Object.entries(details)) {
    if (value) body.append(key, value);
  }
  const document = await api.post<CompanyDocument>(
    "/api/company-documents/upload_document/",
    body,
  );
  toastSuccess("companies.onboarding.toast.documentUploaded");
  return document;
}

export function verifyCompanyDocument(
  id: string,
  verification_status: "VERIFIED" | "REJECTED",
  verification_note = "",
): Promise<CompanyDocument> {
  return api.post<CompanyDocument>("/api/company-documents/verify_document/", {
    id,
    verification_status,
    verification_note,
  });
}

export async function deleteCompanyDocument(id: string): Promise<void> {
  await api.post("/api/company-documents/delete_document/", { id });
  toastSuccess("companies.onboarding.toast.documentRemoved");
}

export async function createCompanyBankAccount(
  company: string,
  payload: CompanyBankAccountPayload,
): Promise<CompanyBankAccount> {
  const account = await api.post<CompanyBankAccount>(
    "/api/company-bank-accounts/create_account/",
    { company, ...payload },
  );
  toastSuccess("companies.onboarding.toast.bankAdded");
  return account;
}

export function verifyCompanyBankAccount(
  id: string,
  verification_status: "VERIFIED" | "REJECTED",
  verification_note = "",
): Promise<CompanyBankAccount> {
  return api.post<CompanyBankAccount>(
    "/api/company-bank-accounts/verify_account/",
    { id, verification_status, verification_note },
  );
}

export async function setPrimaryCompanyBankAccount(id: string): Promise<void> {
  await api.post("/api/company-bank-accounts/set_primary/", { id });
  toastSuccess("companies.onboarding.toast.primaryUpdated");
}

export async function deleteCompanyBankAccount(id: string): Promise<void> {
  await api.post("/api/company-bank-accounts/delete_account/", { id });
  toastSuccess("companies.onboarding.toast.bankRemoved");
}
