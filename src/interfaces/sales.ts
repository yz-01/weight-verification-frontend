export type SalesRole = "EXECUTIVE" | "SUPERVISOR" | "MANAGER" | "AGENT";
export type PayoutState =
  | "DRAFT"
  | "SUPERVISOR_APPROVED"
  | "FINANCE_APPROVED"
  | "PAID"
  | "REJECTED"
  | "CANCELLED";

export interface Territory {
  id: string;
  salesperson: string;
  salesperson_name: string;
  name: string;
  scope: "NATIONAL" | "STATES";
  states: string[];
  is_exclusive: boolean;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  created_at: string;
}

export interface Salesperson {
  id: string;
  code: string;
  full_name: string;
  phone: string;
  email: string;
  sales_role: SalesRole;
  supervisor: string | null;
  supervisor_name: string | null;
  user: string | null;
  commission_scheme: string | null;
  scheme_name: string | null;
  territories: Territory[];
  customer_count: number;
  report_count: number;
  joined_on: string;
  left_on: string | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionScheme {
  id: string;
  code: string;
  name: string;
  description: string;
  basis: string;
  rate: string;
  is_percentage: boolean;
  currency: string;
  payout_cycle: string;
  minimum_payout: string;
  maximum_payout: string | null;
  target_amount: string | null;
  accrual_months: number | null;
  is_active: boolean;
  salesperson_count: number;
}

export interface CommissionPayout {
  id: string;
  salesperson: string;
  salesperson_code: string;
  salesperson_name: string;
  scheme: string;
  scheme_name: string;
  scheme_basis: string;
  state: PayoutState;
  period_start: string;
  period_end: string;
  new_contractors: number;
  new_recyclers: number;
  saas_revenue: string;
  platform_commission: string;
  business_value: string;
  basis_rate: string;
  gross_amount: string;
  adjustment: string;
  net_amount: string;
  currency: string;
  paid_on: string | null;
  payment_reference: string;
  review_note: string;
  notes: string;
}

export interface CustomerAssignment {
  id: string;
  company: string;
  company_code: string;
  company_name: string;
  company_type: "CONTRACTOR" | "RECYCLER";
  salesperson: string;
  salesperson_code: string;
  salesperson_name: string;
  supervisor: string | null;
  supervisor_name: string | null;
  territory: string | null;
  state: string;
  won_on: string;
  accrual_ends_on: string | null;
  notes: string;
  created_at: string;
}

export interface SalesTerms {
  id: string;
  code: string;
  version: number;
  title: string;
  body: string;
  clauses: Record<string, unknown>;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  effective_from: string | null;
  document: string | null;
  acknowledgement_count: number;
  created_at: string;
  updated_at: string;
}

export interface TermsAcknowledgement {
  id: string;
  terms: string;
  terms_code: string;
  terms_version: number;
  salesperson: string;
  salesperson_name: string;
  read_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  note: string;
  created_at: string;
}

export interface SalesSummary {
  total: number;
  active: number;
  by_role: Partial<Record<SalesRole, number>>;
  customers_assigned: number;
  unassigned_states: string[];
}

export interface TeamPerformance {
  salesperson: Salesperson;
  period_start: string;
  period_end: string;
  team_size: number;
  total_customers: number;
  contractors_won: number;
  recyclers_won: number;
  saas_revenue: string;
  platform_commission: string;
  business_value: string;
  commission_payable: string;
}
