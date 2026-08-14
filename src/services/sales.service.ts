/** Sales and commission management service (module 13). */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CommissionPayout,
  CommissionCalculationConfig,
  CommissionScheme,
  CustomerAssignment,
  PayoutState,
  Salesperson,
  SalesRole,
  SalesSummary,
  SalesTerms,
  TeamPerformance,
  TermsAcknowledgement,
  Territory,
} from "@/interfaces/sales";
import { api, download, toastSuccess } from "@/services/api-client";

/** What a new or edited salesperson record carries. */
export interface SalespersonPayload {
  code: string;
  full_name: string;
  email: string;
  phone: string;
  sales_role: SalesRole;
  supervisor?: string | null;
  commission_scheme?: string | null;
  joined_on: string;
  left_on?: string | null;
  is_active?: boolean;
  notes?: string;
}

/**
 * A supervisor's team, rolled up for one period.
 *
 * The backend defaults the period to the scheme's own payout cycle, so a
 * caller that has no opinion sends nothing and still gets a coherent window.
 */
export interface TerritoryPayload {
  salesperson: string;
  name: string;
  scope: "NATIONAL" | "STATES";
  states: string[];
  is_exclusive: boolean;
  effective_from: string;
  effective_to?: string | null;
}

export interface CommissionSchemePayload {
  code: string;
  name: string;
  description?: string;
  basis: string;
  rate: string;
  currency?: string;
  payout_cycle: string;
  minimum_payout?: string;
  maximum_payout?: string | null;
  target_amount?: string | null;
  calculation_config?: CommissionCalculationConfig;
  accrual_months?: number | null;
  is_active?: boolean;
}

/** Omitting `salesperson` runs the calculation for the whole team. */
export interface PayoutCalculatePayload {
  salesperson?: string;
  on_date?: string;
}

/**
 * One step along the approval chain.
 *
 * `note` is not optional in practice for a rejection or a cancellation — the
 * backend refuses both without one, so the salesperson can always be told why.
 */
export interface PayoutTransitionPayload {
  state: PayoutState;
  note?: string;
  payment_reference?: string;
}

export interface CustomerAssignmentPayload {
  company: string;
  salesperson: string;
  won_on: string;
  notes?: string;
}

// ── Salespeople ───────────────────────────────────────────────────────────

export function getSalespeople(
  query?: ListQuery,
): Promise<Paginated<Salesperson>> {
  return api.list<Salesperson>("/api/salespeople/get_salespeople/", query);
}

export function getSalesperson(id: string): Promise<Salesperson> {
  return api.get<Salesperson>(`/api/salespeople/${id}/get_salesperson/`);
}

export function getSalesSummary(): Promise<SalesSummary> {
  return api.get<SalesSummary>("/api/salespeople/get_summary/");
}

export async function createSalesperson(
  payload: SalespersonPayload,
): Promise<Salesperson> {
  const salesperson = await api.post<Salesperson>(
    "/api/salespeople/create_salesperson/",
    payload,
  );
  toastSuccess("sales.toast.created");
  return salesperson;
}

export async function updateSalesperson(
  id: string,
  payload: Partial<SalespersonPayload>,
): Promise<Salesperson> {
  const salesperson = await api.patch<Salesperson>(
    `/api/salespeople/${id}/update_salesperson/`,
    payload,
  );
  toastSuccess("sales.toast.updated");
  return salesperson;
}

export function getTeamPerformance(id: string): Promise<TeamPerformance> {
  return api.get<TeamPerformance>(
    `/api/salespeople/${id}/get_team_performance/`,
  );
}

// Territories
export function getTerritories(
  query?: ListQuery,
): Promise<Paginated<Territory>> {
  return api.list("/api/sales-territories/get_territories/", query);
}

export async function createTerritory(
  payload: TerritoryPayload,
): Promise<Territory> {
  const result = await api.post<Territory>(
    "/api/sales-territories/create_territory/",
    payload,
  );
  toastSuccess("sales.toast.saved");
  return result;
}

export async function updateTerritory(
  id: string,
  payload: Partial<TerritoryPayload>,
): Promise<Territory> {
  const result = await api.patch<Territory>(
    `/api/sales-territories/${id}/update_territory/`,
    payload,
  );
  toastSuccess("sales.toast.saved");
  return result;
}

export async function deleteTerritory(id: string): Promise<void> {
  await api.delete(`/api/sales-territories/${id}/delete_territory/`);
  toastSuccess("sales.toast.removed");
}

// Customer ownership
export function getCustomerAssignments(
  query?: ListQuery,
): Promise<Paginated<CustomerAssignment>> {
  return api.list("/api/customer-assignments/get_assignments/", query);
}

export async function createCustomerAssignment(
  payload: CustomerAssignmentPayload,
): Promise<CustomerAssignment> {
  const result = await api.post<CustomerAssignment>(
    "/api/customer-assignments/create_assignment/",
    payload,
  );
  toastSuccess("sales.toast.saved");
  return result;
}

export async function reassignCustomer(
  id: string,
  salesperson: string,
  reason: string,
): Promise<CustomerAssignment> {
  const result = await api.post<CustomerAssignment>(
    `/api/customer-assignments/${id}/reassign/`,
    { salesperson, reason },
  );
  toastSuccess("sales.toast.reassigned");
  return result;
}

// Commission schemes
export function getCommissionSchemes(
  query?: ListQuery,
): Promise<Paginated<CommissionScheme>> {
  return api.list("/api/commission-schemes/get_schemes/", query);
}

export async function createCommissionScheme(
  payload: CommissionSchemePayload,
): Promise<CommissionScheme> {
  const result = await api.post<CommissionScheme>(
    "/api/commission-schemes/create_scheme/",
    payload,
  );
  toastSuccess("sales.toast.saved");
  return result;
}

export async function updateCommissionScheme(
  id: string,
  payload: Partial<CommissionSchemePayload>,
): Promise<CommissionScheme> {
  const result = await api.patch<CommissionScheme>(
    `/api/commission-schemes/${id}/update_scheme/`,
    payload,
  );
  toastSuccess("sales.toast.saved");
  return result;
}

export async function updateCommissionRule(
  id: string,
  payload: Pick<CommissionSchemePayload, "basis" | "rate"> &
    Pick<
      Partial<CommissionSchemePayload>,
      "target_amount" | "calculation_config"
    >,
): Promise<CommissionScheme> {
  const result = await api.patch<CommissionScheme>(
    `/api/commission-schemes/${id}/update_rule/`,
    payload,
  );
  toastSuccess("sales.toast.saved");
  return result;
}

// Versioned sales terms
export function getSalesTerms(
  query?: ListQuery,
): Promise<Paginated<SalesTerms>> {
  return api.list("/api/sales-terms/get_terms/", query);
}

export async function createSalesTerms(payload: {
  code: string;
  title: string;
  body: string;
  clauses: Record<string, unknown>;
  effective_from?: string | null;
}): Promise<SalesTerms> {
  const result = await api.post<SalesTerms>(
    "/api/sales-terms/create_terms/",
    payload,
  );
  toastSuccess("sales.toast.saved");
  return result;
}

export async function activateSalesTerms(id: string): Promise<SalesTerms> {
  const result = await api.post<SalesTerms>(`/api/sales-terms/${id}/activate/`);
  toastSuccess("sales.toast.activated");
  return result;
}

export async function acknowledgeSalesTerms(
  id: string,
  salesperson: string,
  note: string,
): Promise<TermsAcknowledgement> {
  const result = await api.post<TermsAcknowledgement>(
    `/api/sales-terms/${id}/acknowledge/`,
    { salesperson, note },
  );
  toastSuccess("sales.toast.acknowledged");
  return result;
}

export function getTermsAcknowledgements(
  query?: ListQuery,
): Promise<Paginated<TermsAcknowledgement>> {
  return api.list("/api/sales-terms/get_acknowledgements/", query);
}

// ── Commission payouts ────────────────────────────────────────────────────

export function getPayouts(
  query?: ListQuery,
): Promise<Paginated<CommissionPayout>> {
  return api.list<CommissionPayout>(
    "/api/commission-payouts/get_payouts/",
    query,
  );
}

export async function calculatePayout(
  payload: PayoutCalculatePayload,
): Promise<CommissionPayout> {
  const payout = await api.post<CommissionPayout>(
    "/api/commission-payouts/calculate/",
    payload,
  );
  toastSuccess("sales.toast.payoutCalculated");
  return payout;
}

export async function transitionPayout(
  id: string,
  payload: PayoutTransitionPayload,
): Promise<CommissionPayout> {
  const payout = await api.post<CommissionPayout>(
    `/api/commission-payouts/${id}/transition/`,
    payload,
  );
  toastSuccess("sales.toast.payoutTransitioned");
  return payout;
}

export async function adjustPayout(
  id: string,
  adjustment: string,
  notes: string,
): Promise<CommissionPayout> {
  const payout = await api.post<CommissionPayout>(
    `/api/commission-payouts/${id}/adjust/`,
    { adjustment, notes },
  );
  toastSuccess("sales.toast.payoutTransitioned");
  return payout;
}

export function exportSalesDataset(
  endpoint: "salespeople" | "assignments" | "payouts",
  format: "pdf" | "xlsx",
  title: string,
  subtitle: string,
  columns: Array<{ key: string; label: string }>,
): Promise<void> {
  const path =
    endpoint === "salespeople"
      ? "/api/salespeople/export_salespeople/"
      : endpoint === "assignments"
        ? "/api/customer-assignments/export_assignments/"
        : "/api/commission-payouts/export_payouts/";
  return download(path, {
    method: "POST",
    body: { format, title, subtitle, columns, empty_label: "" },
    fallbackFilename: `${endpoint}.${format === "pdf" ? "pdf" : "xlsx"}`,
  });
}
