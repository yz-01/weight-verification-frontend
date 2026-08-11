/** Billing and commission management service (Admin module 5). */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  BillingSummary,
  AutomaticBillingStatus,
  BillingJobRun,
  CommissionRule,
  CommissionRulePayload,
  CreatePaymentPayload,
  Invoice,
  InvoiceDetail,
  InvoiceKind,
  FinancialReportsSummary,
  Payment,
  PaymentState,
} from "@/interfaces/billing";
import type { ExportRequest } from "@/services/contractor.service";
import { api, download, toastSuccess } from "@/services/api-client";

export function getInvoices(query?: ListQuery): Promise<Paginated<Invoice>> {
  return api.list<Invoice>("/api/invoices/get_invoices/", query);
}

export function getInvoice(id: string): Promise<InvoiceDetail> {
  return api.get<InvoiceDetail>(`/api/invoices/${id}/get_invoice/`);
}

export function getBillingSummary(): Promise<BillingSummary> {
  return api.get<BillingSummary>("/api/invoices/get_summary/");
}

export function getAutomaticBilling(): Promise<AutomaticBillingStatus> {
  return api.get<AutomaticBillingStatus>(
    "/api/invoices/get_automatic_billing/",
  );
}

export function getFinancialReports(
  query?: ListQuery,
): Promise<FinancialReportsSummary> {
  return api.get<FinancialReportsSummary>(
    "/api/invoices/get_financial_reports/",
    query,
  );
}

export async function runAutomaticBilling(): Promise<BillingJobRun> {
  const run = await api.post<BillingJobRun>(
    "/api/invoices/run_automatic_billing/",
  );
  toastSuccess("billing.automatic.toast.queued");
  return run;
}

export async function generateInvoice(payload: {
  company: string;
  kind: InvoiceKind;
  on_date?: string;
}): Promise<InvoiceDetail> {
  const invoice = await api.post<InvoiceDetail>(
    "/api/invoices/generate_invoice/",
    payload,
  );
  toastSuccess("billing.toast.invoiceGenerated");
  return invoice;
}

export async function issueInvoice(id: string): Promise<InvoiceDetail> {
  const invoice = await api.post<InvoiceDetail>(`/api/invoices/${id}/issue/`);
  toastSuccess("billing.toast.invoiceIssued");
  return invoice;
}

export async function closeInvoice(
  id: string,
  state: "CANCELLED" | "WRITTEN_OFF",
  notes: string,
): Promise<InvoiceDetail> {
  const invoice = await api.post<InvoiceDetail>(
    `/api/invoices/${id}/update_state/`,
    { state, notes },
  );
  toastSuccess("billing.toast.stateUpdated");
  return invoice;
}

export function exportInvoices(request: ExportRequest): Promise<void> {
  const { page, page_size, ...query } = request.query;
  void page;
  void page_size;
  return download("/api/invoices/export_invoices/", {
    method: "POST",
    query,
    body: {
      format: request.format,
      title: request.title,
      subtitle: request.subtitle ?? "",
      empty_label: request.emptyLabel ?? "",
      columns: request.columns,
    },
    fallbackFilename: `billing.${request.format}`,
  });
}

export function exportPayments(request: ExportRequest): Promise<void> {
  const { page, page_size, ...query } = request.query;
  void page;
  void page_size;
  return download("/api/payments/export_payments/", {
    method: "POST",
    query,
    body: {
      format: request.format,
      title: request.title,
      subtitle: request.subtitle ?? "",
      empty_label: request.emptyLabel ?? "",
      columns: request.columns,
    },
    fallbackFilename: `payments.${request.format}`,
  });
}

export function getPayments(query?: ListQuery): Promise<Paginated<Payment>> {
  return api.list<Payment>("/api/payments/get_payments/", query);
}

export async function createPayment(
  payload: CreatePaymentPayload,
): Promise<Payment> {
  const form = new FormData();
  form.append("invoice", payload.invoice);
  form.append("amount", payload.amount);
  form.append("paid_on", payload.paid_on);
  form.append("method", payload.method);
  form.append("reference", payload.reference);
  form.append("notes", payload.notes);
  if (payload.proof) form.append("proof", payload.proof);
  const payment = await api.post<Payment>("/api/payments/create_payment/", form);
  toastSuccess("billing.toast.paymentCreated");
  return payment;
}

export async function reviewPayment(
  id: string,
  state: Extract<PaymentState, "CONFIRMED" | "REJECTED">,
  review_note: string,
): Promise<Payment> {
  const payment = await api.post<Payment>(
    `/api/payments/${id}/review_payment/`,
    { state, review_note },
  );
  toastSuccess("billing.toast.paymentReviewed");
  return payment;
}

export function getCommissionRules(
  query?: ListQuery,
): Promise<Paginated<CommissionRule>> {
  return api.list<CommissionRule>("/api/commission-rules/get_rules/", query);
}

export async function createCommissionRule(
  payload: CommissionRulePayload,
): Promise<CommissionRule> {
  const rule = await api.post<CommissionRule>(
    "/api/commission-rules/create_rule/",
    payload,
  );
  toastSuccess("billing.toast.ruleCreated");
  return rule;
}

export async function updateCommissionRule(
  id: string,
  payload: CommissionRulePayload,
): Promise<CommissionRule> {
  const rule = await api.patch<CommissionRule>(
    `/api/commission-rules/${id}/update_rule/`,
    payload,
  );
  toastSuccess("billing.toast.ruleUpdated");
  return rule;
}

export async function deleteCommissionRule(id: string): Promise<void> {
  await api.delete(`/api/commission-rules/${id}/delete_rule/`);
  toastSuccess("billing.toast.ruleDeleted");
}
