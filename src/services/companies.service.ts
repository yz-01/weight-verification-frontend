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

/**
 * Correct a bank account already on file.
 *
 * Deleting and re-adding loses the verification decision with it, so a
 * mistyped digit would cost the reviewer another round trip. The backend
 * re-opens verification when the money-carrying fields change, which is the
 * right trade: a corrected account is a different account until somebody
 * confirms it again.
 */
export async function updateCompanyBankAccount(
  id: string,
  payload: Partial<CompanyBankAccountPayload>,
): Promise<CompanyBankAccount> {
  const account = await api.post<CompanyBankAccount>(
    "/api/company-bank-accounts/update_account/",
    { id, ...payload },
  );
  toastSuccess("companies.onboarding.toast.bankUpdated");
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

/**
 * The account a tenant activation key was sent to.
 *
 * Returns null when the company has no owner account, which is a real state
 * for tenants created before the owner became part of creating a company.
 */
export interface CompanyOwnerAccount {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  status: string;
  /** Whether the reader is a superuser. Only they may move the address. */
  can_be_edited: boolean;
}

export function getCompanyOwnerAccount(
  id: string,
): Promise<CompanyOwnerAccount | null> {
  return api.get<CompanyOwnerAccount | null>(
    `/api/companies/${id}/get_owner_account/`,
  );
}

export interface OwnerAccountUpdate {
  id: string;
  email: string;
  phone: string;
  status: string;
  invitation_sent: boolean;
  /** Only when the email did not go out, so the link can be passed on by hand. */
  invitation_url: string;
}

export function updateCompanyOwnerAccount(
  id: string,
  payload: { email?: string; phone?: string; owner_email_copy?: unknown },
): Promise<OwnerAccountUpdate> {
  return api.post<OwnerAccountUpdate>(
    `/api/companies/${id}/update_owner_account/`,
    payload,
  );
}
