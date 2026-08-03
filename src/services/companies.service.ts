/** Tenant company management. Platform staff only. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CompanyDetail,
  CompanyPayload,
  CompanyReviewPayload,
  CompanyRow,
  CompanyStatusPayload,
  CompanySummary,
  SubscriptionPlan,
} from "@/interfaces/company";
import { api, toastSuccess } from "@/services/api-client";

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
    payload,
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
    payload,
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

export function getSubscriptionPlans(): Promise<Paginated<SubscriptionPlan>> {
  return api.list<SubscriptionPlan>("/api/subscription-plans/get_plans/", {
    is_active: true,
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
