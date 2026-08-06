/** Partner management service (module 16). */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CreatePartnerPayload,
  CustomerReferral,
  Partner,
  PartnerAgreement,
  PartnerCommissionPayout,
  PartnerStatus,
  PartnerSummary,
  PartnerPerformance,
  PartnerTerritory,
  PartnerTypeDefinition,
  PartnerType,
} from "@/interfaces/partner";
import { api, download, toastSuccess } from "@/services/api-client";

/**
 * The filters the partner list accepts.
 *
 * Narrowed to the union types rather than plain strings so a typo in a filter
 * pill fails at compile time instead of quietly returning an unfiltered page.
 */
export interface PartnerListQuery extends ListQuery {
  type?: PartnerType;
  status?: PartnerStatus;
}

/** What a new agreement carries. Commission drives every later payout. */
export interface CreateAgreementPayload {
  partner_id: string;
  title: string;
  description: string;
  terms: string;
  effective_from: string;
  effective_to?: string | null;
  commission_basis: string;
  commission_rate: string | number;
  minimum_payout?: string | number | null;
  payout_cycle?: string;
  calculation_config?: Record<string, unknown>;
  document?: File | null;
}

/**
 * The window a payout is calculated over.
 *
 * Both bounds are required: the backend refuses an open-ended period because a
 * commission run has to be reproducible from the dates alone.
 */
export interface CalculatePartnerPayoutPayload {
  partner_id: string;
  period_start: string;
  period_end: string;
}

// ── Partners ──────────────────────────────────────────────────────────────

export function getPartners(
  query?: PartnerListQuery,
): Promise<Paginated<Partner>> {
  return api.list<Partner>("/api/partners/get-partners/", query);
}

export function getPartner(id: string): Promise<Partner> {
  return api.get<Partner>(`/api/partners/get-partner/${id}/`);
}

export function getPartnerSummary(): Promise<PartnerSummary> {
  return api.get<PartnerSummary>("/api/partners/get-summary/");
}

export function getPartnerTypes(): Promise<Paginated<PartnerTypeDefinition>> {
  return api.list<PartnerTypeDefinition>("/api/partner-types/get-types/", { page_size: 200, sort_by: "name" });
}

export async function createPartnerType(payload: { code: string; name: string; description?: string }) {
  return api.post<PartnerTypeDefinition>("/api/partner-types/create-type/", payload);
}

export async function updatePartnerType(id: string, payload: Partial<{ name: string; description: string; is_active: boolean }>) {
  return api.patch<PartnerTypeDefinition>(`/api/partner-types/update-type/${id}/`, payload);
}

export async function deletePartnerType(id: string) {
  return api.delete(`/api/partner-types/delete-type/${id}/`);
}

export async function createPartner(
  payload: CreatePartnerPayload,
): Promise<Partner> {
  const partner = await api.post<Partner>(
    "/api/partners/create-partner/",
    payload,
  );
  toastSuccess("partners.toast.created");
  return partner;
}

export async function updatePartner(
  id: string,
  payload: Partial<CreatePartnerPayload>,
): Promise<Partner> {
  const partner = await api.patch<Partner>(
    `/api/partners/update-partner/${id}/`,
    payload,
  );
  toastSuccess("partners.toast.updated");
  return partner;
}

// ── Agreements ────────────────────────────────────────────────────────────

export function getAgreements(
  query?: ListQuery,
): Promise<Paginated<PartnerAgreement>> {
  return api.list<PartnerAgreement>(
    "/api/partner-agreements/get-agreements/",
    query,
  );
}

export async function createAgreement(
  payload: CreateAgreementPayload,
): Promise<PartnerAgreement> {
  const body = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (key === "document" && value instanceof File) body.append(key, value);
    else if (key === "calculation_config") body.append(key, JSON.stringify(value));
    else body.append(key, String(value));
  });
  const agreement = await api.post<PartnerAgreement>("/api/partner-agreements/create-agreement/", body);
  toastSuccess("partners.toast.agreementCreated");
  return agreement;
}

export async function submitAgreement(id: string) { return api.post<PartnerAgreement>(`/api/partner-agreements/submit-agreement/${id}/`, {}); }
export async function activateAgreement(id: string, signedBy: string, signedOn?: string) { return api.post<PartnerAgreement>(`/api/partner-agreements/activate-agreement/${id}/`, { signed_by: signedBy, signed_on: signedOn }); }
export async function renewAgreement(id: string, payload: Partial<CreateAgreementPayload>) {
  return api.post<PartnerAgreement>(`/api/partner-agreements/renew-agreement/${id}/`, payload);
}
export async function terminateAgreement(id: string, reason: string) { return api.post<PartnerAgreement>(`/api/partner-agreements/terminate-agreement/${id}/`, { reason }); }
export function viewAgreementDocument(id: string) { return download(`/api/partner-agreements/view-document/${id}/`, { method: "GET", fallbackFilename: "agreement", openInNewTab: true }); }
export function downloadAgreementDocument(id: string) { return download(`/api/partner-agreements/download-document/${id}/`, { method: "GET", fallbackFilename: "agreement" }); }

export function getTerritories(query?: ListQuery): Promise<Paginated<PartnerTerritory>> { return api.list("/api/partner-territories/get-territories/", query); }
export async function createTerritory(payload: Record<string, unknown>) { return api.post<PartnerTerritory>("/api/partner-territories/create-territory/", payload); }
export async function updateTerritory(id: string, payload: Record<string, unknown>) { return api.patch<PartnerTerritory>(`/api/partner-territories/update-territory/${id}/`, payload); }
export async function deleteTerritory(id: string) { return api.delete(`/api/partner-territories/delete-territory/${id}/`); }

export function getReferrals(query?: ListQuery): Promise<Paginated<CustomerReferral>> { return api.list("/api/customer-referrals/get-referrals/", query); }
export async function createReferral(payload: Record<string, unknown>) { return api.post<CustomerReferral>("/api/customer-referrals/create-referral/", payload); }
export async function updateReferral(id: string, payload: Record<string, unknown>) { return api.patch<CustomerReferral>(`/api/customer-referrals/update-referral/${id}/`, payload); }

// ── Commission payouts ────────────────────────────────────────────────────

export function getPartnerPayouts(
  query?: ListQuery,
): Promise<Paginated<PartnerCommissionPayout>> {
  return api.list<PartnerCommissionPayout>(
    "/api/partner-payouts/get-payouts/",
    query,
  );
}

export async function calculatePartnerPayout(
  payload: CalculatePartnerPayoutPayload,
): Promise<PartnerCommissionPayout> {
  const payout = await api.post<PartnerCommissionPayout>(
    "/api/partner-payouts/calculate-payout/",
    payload,
  );
  toastSuccess("partners.toast.payoutCalculated");
  return payout;
}

export async function adjustPartnerPayout(id: string, adjustment: string, reason: string) { return api.post<PartnerCommissionPayout>(`/api/partner-payouts/adjust-payout/${id}/`, { adjustment, reason }); }
export async function transitionPartnerPayout(id: string, state: string, extra: Record<string, unknown> = {}) { return api.post<PartnerCommissionPayout>(`/api/partner-payouts/transition-payout/${id}/`, { state, ...extra }); }
export function getPartnerPerformance(query?: ListQuery): Promise<{ results: PartnerPerformance[]; count: number }> { return api.get("/api/partner-reports/get-performance/", query); }
export function exportPartnerReport(dataset: string, format: "pdf" | "xlsx", title: string, columns: Array<{ key: string; label: string }>) { return download("/api/partner-reports/export-report/", { method: "POST", body: { dataset, format, title, columns, empty_label: "" }, fallbackFilename: `partner-${dataset}.${format}` }); }
