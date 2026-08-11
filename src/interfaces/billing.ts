/** Billing and commission management (Admin module 5). */

export type InvoiceKind = "SAAS" | "COMMISSION";
export type InvoiceState =
  | "DRAFT"
  | "ISSUED"
  | "PAID"
  | "PARTIALLY_PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "WRITTEN_OFF";
export type PaymentState = "PENDING" | "CONFIRMED" | "REJECTED";
export type PaymentMethod = "BANK_TRANSFER" | "CHEQUE" | "CASH" | "ONLINE" | "OTHER";
export type CommissionBasis = "SETTLED_AMOUNT" | "SETTLED_WEIGHT";
export type SettlementCycle = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface Invoice {
  id: string;
  invoice_no: string;
  kind: InvoiceKind;
  state: InvoiceState;
  company: string;
  company_name: string;
  company_code: string;
  company_type: "CONTRACTOR" | "RECYCLER";
  period_start: string;
  period_end: string;
  currency: string;
  total_amount: string;
  amount_paid: string;
  amount_outstanding: string;
  issued_on: string | null;
  due_on: string | null;
  created_at: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  line_total: string;
  tax_amount: string;
  sort_order: number;
}

export interface InvoiceSettlement {
  id: string;
  settlement: string;
  settlement_no: string;
  dispatch_no: string;
  issued_at: string;
  settled_weight_kg: string;
  settled_amount: string;
}

export interface Payment {
  id: string;
  invoice: string;
  invoice_no: string;
  company_name: string;
  amount: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string;
  proof: string | null;
  notes: string;
  state: PaymentState;
  review_note: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  created_at: string;
}

export interface InvoiceDetail extends Invoice {
  plan: string | null;
  plan_name: string | null;
  commission_rule: string | null;
  commission_rule_name: string | null;
  subtotal: string;
  tax_amount: string;
  basis_weight_kg: string;
  basis_amount: string;
  basis_rate: string | null;
  notes: string;
  lines: InvoiceLine[];
  settlement_links: InvoiceSettlement[];
  payments: Payment[];
}

export interface CommissionRule {
  id: string;
  name: string;
  company: string | null;
  company_name: string | null;
  basis: CommissionBasis;
  rate: string;
  cycle: SettlementCycle;
  payment_term_days: number;
  minimum_amount: string;
  maximum_amount: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string;
  is_active: boolean;
  invoice_count: number;
  created_at: string;
  updated_at: string;
}

export interface RevenueSummary {
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
  open_count: number;
}

export interface BillingSummary {
  saas: RevenueSummary;
  commission: RevenueSummary;
  pending_payment_review: number;
  period_start: string;
  period_end: string;
}

export type BillingJobState =
  | "QUEUED"
  | "RUNNING"
  | "RETRY_WAIT"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface BillingScheduledJob {
  id: string;
  code: string;
  name: string;
  interval_minutes: number | null;
  next_run_at: string | null;
  is_active: boolean;
  last_run_at: string | null;
  last_run_state: BillingJobState | "";
}

export interface BillingJobRun {
  id: string;
  job: string;
  job_code: string;
  state: BillingJobState;
  attempt: number;
  max_attempts: number;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown>;
  error: string;
  created_at: string;
}

export interface AutomaticBillingStatus {
  job: BillingScheduledJob | null;
  runs: BillingJobRun[];
}

export interface FinancialReportTotals {
  invoice_count: number;
  payment_count: number;
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
}

export interface FinancialReportsSummary {
  period_start: string | null;
  period_end: string | null;
  currency: string;
  reports: {
    saas: FinancialReportTotals;
    commission: FinancialReportTotals;
    receivables: FinancialReportTotals;
    paid: FinancialReportTotals;
    unpaid: FinancialReportTotals;
  };
}

export interface CreatePaymentPayload {
  invoice: string;
  amount: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  proof?: File | null;
}

export interface CommissionRulePayload {
  name: string;
  basis: CommissionBasis;
  rate: string;
  cycle: SettlementCycle;
  payment_term_days: number;
  minimum_amount: string;
  maximum_amount: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string;
  is_active: boolean;
}
