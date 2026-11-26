/**
 * 设备租赁月结单 (JB280, 客户 11-26 事项 21): `/api/equipment-rental-statements/`.
 *
 * 「支持按项目、设备公司、开始日期及结束日期，自动生成设备租赁月结单」: a preview
 * of what would be kept, then 【生成月结单】 (PIN). The lists by 状态 (待核对 /
 * 已核对 / 已结算 / 已作废), 设备公司, 项目 and dates; one statement; its A4
 * PDF; 【作废】 one still 待核对. The 核对与结算 calls are the material ones'
 * (`return-check.service`, kind `RENTAL`).
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import { api, fetchAsFile, toastSuccess } from "@/services/api-client";

/** The five amounts, as strings (RM, two places). */
export interface RentalAmounts {
  base_rent: string;
  overtime_fee: string;
  diesel_fee: string;
  adjustment_amount: string;
  rental_total: string;
}

/** One machine of a statement. */
export interface RentalStatementLine extends RentalAmounts {
  equipment: string;
  equipment_no: string;
  equipment_code: string;
  equipment_name: string;
  terms: { method?: string; unit_price?: string } & Record<string, unknown>;
  days_worked: number;
  normal_hours: string;
  overtime_hours: string;
  months: { month: string; confirmed: boolean; rental_total: string }[];
}

export type RentalStatementState = "PENDING" | "CHECKED" | "SETTLED" | "CANCELLED";

/** One line of the lists. */
export interface RentalStatementRow extends RentalAmounts {
  id: string;
  statement_no: string;
  project: string;
  project_name: string;
  supplier: string;
  supplier_name: string;
  date_from: string;
  date_to: string;
  machine_count: number;
  state: RentalStatementState;
  generated_by_name: string;
  generated_at: string;
  rental_check: string | null;
  check_no: string;
  settlement_no: string;
  cancelled_at: string | null;
  cancelled_by_name: string;
  cancel_reason: string;
}

/** Under the statement: its 核对 and 结算 (two-way links). */
export interface RentalStatementLinks {
  state: "CHECKED" | "SETTLED";
  check_id: string;
  check_no: string;
  checked_by_name: string;
  checked_at: string;
  settlement_id: string | null;
  settlement_no: string;
  settled_by_name: string;
  settled_at: string | null;
}

export interface RentalStatement extends RentalStatementRow {
  lines: RentalStatementLine[];
  check: RentalStatementLinks | null;
  check_voucher_no: string;
  settlement_voucher_no: string;
}

export interface RentalStatementPreview extends RentalAmounts {
  project: string;
  project_name: string;
  supplier: string;
  supplier_name: string;
  date_from: string;
  date_to: string;
  lines: RentalStatementLine[];
  /** A live statement of the same project and company sharing a day. */
  overlap: string;
}

export interface RentalStatementChoices {
  project: string;
  supplier: string;
  date_from: string;
  date_to: string;
}

const BASE = "/api/equipment-rental-statements/";

export const getRentalStatements = (query: ListQuery = {}): Promise<Paginated<RentalStatementRow>> =>
  api.list<RentalStatementRow>(`${BASE}get_statements/`, query);

export const getRentalStatement = (id: string) => api.get<RentalStatement>(`${BASE}${id}/get_statement/`);

export const getRentalStatementCompanies = (project?: string) =>
  api.get<{ suppliers: { id: string; name: string }[] }>(
    `${BASE}get_filter_options/`,
    project ? { project } : {},
  );

/** What 【生成月结单】 would keep - or the server's reason why not. */
export const previewRentalStatement = (choices: RentalStatementChoices) =>
  api.get<RentalStatementPreview>(`${BASE}preview_statement/`, { ...choices });

export async function createRentalStatement(choices: RentalStatementChoices): Promise<RentalStatement> {
  const statement = await api.post<RentalStatement>(`${BASE}create_statement/`, choices);
  toastSuccess("jb280.generatedToast", { number: statement.statement_no });
  return statement;
}

export async function cancelRentalStatement(id: string, reason: string): Promise<RentalStatement> {
  const statement = await api.post<RentalStatement>(`${BASE}${id}/cancel_statement/`, { reason });
  toastSuccess("jb280.cancelledToast", { number: statement.statement_no });
  return statement;
}

/** 「设备租赁月结单」 A4: what 预览 · 打印 · 导出 · 发送 act on. */
export const rentalStatementPdfFile = (id: string, lang: string, number: string) =>
  fetchAsFile(`${BASE}${id}/get_statement_pdf/`, {
    method: "GET",
    query: { lang },
    fallbackFilename: `${number || "rental-statement"}.pdf`,
  });
