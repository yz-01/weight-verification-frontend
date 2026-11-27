/**
 * 人工结算单 (JB295, 客户 11-27i): `/api/labour-statements/`.
 *
 * 「支持按所属公司及月份生成结算单。保留待核对、已核对、已结算三个状态。」 One
 * statement = one project + one 所属公司 + one month (LB-MS…). 【先看一下】
 * shows what would be kept, then 【生成结算单】 (PIN `labour.statement`); the
 * people whose month is not confirmed yet are confirmed in the same step.
 * 核对 / 结算 are the shared ones (`return-check.service`, kind `LABOUR`).
 */

import { api, fetchAsFile, toastSuccess } from "@/services/api-client";
import type { LabourMonthPerson } from "@/services/labour.service";

export type LabourStatementState = "PENDING" | "CHECKED" | "SETTLED" | "CANCELLED";
export type LabourStatementTab = "pending" | "checked" | "settled" | "all";

export interface LabourStatementSummary {
  id: string;
  statement_no: string;
  project: string;
  project_name: string;
  company_key: string;
  company_name: string;
  /** YYYY-MM. */
  month: string;
  state: LabourStatementState;
  line_count: number;
  days_total: number;
  normal_hours_total: string;
  overtime_hours_total: string;
  normal_amount?: string | null;
  overtime_amount?: string | null;
  labour_total: string | null;
  generated_by_name: string;
  generated_at: string;
  check: { id: string; check_no: string } | null;
  settlement: { id: string; settlement_no: string } | null;
  cancelled_at?: string | null;
}

/** One person of a statement, with the days it was priced from. */
export interface LabourStatementLine extends LabourMonthPerson {
  days: { date: string; worked: boolean; normal_hours: string; overtime_hours: string; day_amount: string | null }[];
}

export interface LabourStatementTotals {
  days_worked?: number;
  normal_hours?: string;
  overtime_hours?: string;
  normal_amount?: string | null;
  overtime_amount?: string | null;
  labour_amount?: string | null;
}

export interface LabourStatement extends LabourStatementSummary {
  lines: LabourStatementLine[];
  totals?: LabourStatementTotals;
  cancelled_by_name?: string;
  cancel_reason?: string;
}

export interface LabourStatementPreview {
  lines: LabourStatementLine[];
  totals: LabourStatementTotals;
  will_confirm: { key: string; name: string }[];
  no_rate: { key: string; name: string }[];
  no_company: { key: string; name: string }[];
  /** JB295b: 「已含在设备租赁费用内，不计人工」 - left out of the lines. */
  in_rental?: { key: string; name: string; reason: string }[];
  overlap: { id: string; statement_no: string } | null;
  month_over: boolean;
}

export interface LabourStatementChoices {
  project: string;
  company_key: string;
  month: string;
}

export type LabourStatementCounts = Record<LabourStatementTab, number>;

export interface LabourStatementList {
  rows: LabourStatementSummary[];
  counts: LabourStatementCounts | null;
}

export interface LabourStatementQuery {
  state: LabourStatementTab;
  project?: string;
  company?: string;
  month?: string;
}

const BASE = "/api/labour-statements/";

/**
 * The contract's `{rows, counts}`; a paginated `{results, count}` is read
 * the same way, so the page does not depend on which one the server sends.
 */
export function readStatementList(data: unknown): LabourStatementList {
  const value = (data ?? {}) as {
    rows?: LabourStatementSummary[];
    results?: LabourStatementSummary[];
    counts?: LabourStatementCounts;
  };
  return { rows: value.rows ?? value.results ?? [], counts: value.counts ?? null };
}

export async function getLabourStatements(query: LabourStatementQuery): Promise<LabourStatementList> {
  const params: Record<string, string> = { state: query.state };
  if (query.project) params.project = query.project;
  if (query.company) params.company = query.company;
  if (query.month) params.month = query.month;
  return readStatementList(await api.get<unknown>(`${BASE}get_statements/`, params));
}

export const getLabourStatement = (id: string) => api.get<LabourStatement>(`${BASE}${id}/get_statement/`);

export const getLabourStatementFilters = (project?: string) =>
  api.get<{
    projects: { id: string; name: string }[];
    companies: { key: string; name: string; kind?: string }[];
    months: string[];
  }>(`${BASE}get_filter_options/`, project ? { project } : {});

/** What 【生成结算单】 would keep - and who stops it. */
export const previewLabourStatement = (choices: LabourStatementChoices) =>
  api.get<LabourStatementPreview>(`${BASE}preview_statement/`, { ...choices });

export async function createLabourStatement(choices: LabourStatementChoices): Promise<LabourStatement> {
  const statement = await api.post<LabourStatement>("/api/labour-statements/create_statement/", choices);
  toastSuccess("jb295.statement.generatedToast", { number: statement.statement_no });
  return statement;
}

/** 【作废】, only while 待核对: reason + PIN `labour.statement`. */
export async function cancelLabourStatement(id: string, reason: string): Promise<LabourStatement> {
  const statement = await api.post<LabourStatement>(`/api/labour-statements/${id}/cancel_statement/`, { id, reason });
  toastSuccess("jb295.statement.cancelledToast", { number: statement.statement_no });
  return statement;
}

/** 「人工结算单」 A4: what 预览 · 打印 · 导出 · 发送 act on. */
export const labourStatementPdfFile = (id: string, lang: string, number: string) =>
  fetchAsFile(`${BASE}${id}/get_statement_pdf/`, {
    method: "GET",
    query: { lang },
    fallbackFilename: `${number || "labour-statement"}.pdf`,
  });

/** 【核对与结算】's first step: the 所属公司 with statements waiting. */
export const getLabourPendingCompanies = (project?: string) =>
  api.get<{ rows: { company_key: string; company_name: string; statements: LabourStatementSummary[] }[] }>(
    `${BASE}get_pending_companies/`,
    project ? { project } : {},
  );
