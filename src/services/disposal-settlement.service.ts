/**
 * JB287 (客户 11-27): 垃圾清运「清运费用设定」 and 「清运结算管理」.
 *
 * 「建筑商后台按照供应商填写合同约定的每车清运费用，参照现有材料分类的价格设定方式，
 * 只需填写一次。」 - `/api/disposal-fees/`: one fee per clearance supplier, set
 * once from a 生效日期 and kept as history (a change is a new row; the old
 * ones stay, so 「原有合同价格调整后，不得影响历史费用记录」).
 *
 * 「「全部」页面…调整为「清运结算管理」，负责批量核对、生成结算编号、准备结算、
 * 结算完毕及历史归档。」 - `/api/disposal-settlements/`: the archived jobs not
 * yet checked (未核对), 【确认核对】 (one settlement of one project and one
 * supplier), the settlements (准备结算 / 结算完毕), the PIN-signed 结算完毕,
 * the six figures and the A4 结算单.
 *
 * Amounts are strings with two decimals, or null when the reader may not
 * see amounts (`amounts_hidden`).
 */

import { api, fetchAsFile, toastSuccess } from "@/services/api-client";

/* ------------------------------------------------------------------ */
/* 清运费用设定                                                          */
/* ------------------------------------------------------------------ */

/** One fee row: 每车清运费用 from 生效日期, who set it and when. */
export interface DisposalFeeEntry {
  id: string;
  fee_per_trip: string;
  effective_from: string;
  set_by_name: string;
  set_at: string;
  note: string;
}

/** One supplier in the 清运费用设定 window. */
export interface DisposalFeeSupplier {
  supplier: { id: string; name: string };
  /** The fee in force today; null when none was set yet. */
  current: DisposalFeeEntry | null;
  /** A fee set for a later day. */
  upcoming: DisposalFeeEntry | null;
  history_count: number;
}

/** One line of 修改记录: old → new, who, when, 生效日期. */
export interface DisposalFeeHistoryRow extends DisposalFeeEntry {
  previous_fee: string | null;
}

export const getDisposalFees = () => api.get<DisposalFeeSupplier[]>("/api/disposal-fees/");

export const getDisposalFeeHistory = (supplier: string) =>
  api.get<DisposalFeeHistoryRow[]>("/api/disposal-fees/history/", { supplier });

/** 【保存】: a new row; the server refuses a second row on the same day. */
export async function setDisposalFee(payload: {
  supplier: string;
  fee_per_trip: string;
  effective_from: string;
  note?: string;
}): Promise<DisposalFeeEntry> {
  const row = await api.post<DisposalFeeEntry>("/api/disposal-fees/", {
    supplier: payload.supplier,
    fee_per_trip: payload.fee_per_trip,
    effective_from: payload.effective_from,
    ...(payload.note?.trim() ? { note: payload.note.trim() } : {}),
  });
  toastSuccess("jb287.fee.saved");
  return row;
}

/* ------------------------------------------------------------------ */
/* 清运结算管理                                                          */
/* ------------------------------------------------------------------ */

/** The page's filters: the top bar's project, a supplier and 清运日期. */
export interface DisposalSettlementFilters {
  project?: string;
  supplier?: string;
  date_from?: string;
  date_to?: string;
}

function filterQuery(filters: DisposalSettlementFilters): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of ["project", "supplier", "date_from", "date_to"] as const) {
    const value = filters[key];
    if (value) query[key] = value;
  }
  return query;
}

/** One 未核对 row: the eight columns the client listed. */
export interface DisposalPendingRow {
  disposal_id: string;
  reference_no: string;
  project: { id: string; name: string };
  supplier: { id: string; name: string };
  cleared_on: string;
  trip_count: number;
  fee_per_trip: string | null;
  fee_amount: string | null;
  can_tick: boolean;
  /** Why it cannot be ticked (no fee yet), already in the reader's words. */
  cannot_tick_reason: string | null;
}

export interface DisposalPending {
  rows: DisposalPendingRow[];
  /** 筛选范围内的累计金额: the rows shown, added up. */
  filtered_amount: string | null;
  amounts_hidden?: boolean;
}

export type DisposalSettlementStatus = "READY" | "SETTLED";

/** One line of 准备结算 / 结算完毕. */
export interface DisposalSettlementRow {
  id: string;
  number: string;
  project: { id: string; name: string };
  supplier: { id: string; name: string };
  date_from: string;
  date_to: string;
  trip_total: number;
  amount_total: string | null;
  line_count: number;
  status: DisposalSettlementStatus;
  checked_by_name: string;
  checked_at: string;
  settled_by_name: string | null;
  settled_at: string | null;
  amounts_hidden?: boolean;
}

/** One 清运记录 in a settlement, frozen at 确认核对. */
export interface DisposalSettlementLine {
  disposal_id: string;
  reference_no: string;
  cleared_on: string;
  trip_count: number;
  fee_per_trip: string | null;
  fee_amount: string | null;
  weight_kg: string | null;
}

export interface DisposalSettlement extends DisposalSettlementRow {
  lines: DisposalSettlementLine[];
}

/** 页面上方累计统计: the six figures, and the jobs with no fee yet. */
export interface DisposalSettlementSummary {
  trip_total: number;
  weight_total_kg: string;
  amount_total: string | null;
  unchecked_amount: string | null;
  ready_amount: string | null;
  settled_amount: string | null;
  no_fee_count: number;
  amounts_hidden?: boolean;
}

export const getDisposalPending = (filters: DisposalSettlementFilters) =>
  api.get<DisposalPending>("/api/disposal-settlements/pending/", filterQuery(filters));

export const getDisposalSettlements = (status: DisposalSettlementStatus, filters: DisposalSettlementFilters) =>
  api.get<DisposalSettlementRow[]>("/api/disposal-settlements/", { status, ...filterQuery(filters) });

export const getDisposalSettlement = (id: string) =>
  api.get<DisposalSettlement>(`/api/disposal-settlements/${id}/`);

export const getDisposalSettlementSummary = (filters: DisposalSettlementFilters) =>
  api.get<DisposalSettlementSummary>("/api/disposal-settlements/summary/", filterQuery(filters));

/** 【确认核对】: the ticked jobs of one project and one supplier → one READY settlement. */
export async function createDisposalSettlement(disposalIds: readonly string[]): Promise<DisposalSettlement> {
  const settlement = await api.post<DisposalSettlement>("/api/disposal-settlements/", {
    disposal_ids: [...disposalIds],
  });
  return settlement;
}

/**
 * 【结算完毕】: READY → SETTLED. `signOffPin` is the PIN checked when
 * 【准备结算】 was pressed; the server checks it again and refuses without it.
 */
export async function settleDisposalSettlement(id: string, signOffPin?: string): Promise<DisposalSettlement> {
  const settlement = await api.post<DisposalSettlement>(
    `/api/disposal-settlements/${id}/settle/`,
    {},
    { signOffPin: signOffPin || undefined },
  );
  toastSuccess("jb287.settle.done", { number: settlement.number });
  return settlement;
}

/** The A4 清运结算单 that 预览 · 打印 · 导出 act on. */
export const disposalSettlementPdfFile = (id: string, lang: string, number: string) =>
  fetchAsFile(`/api/disposal-settlements/${id}/pdf/`, {
    method: "GET",
    query: { lang },
    fallbackFilename: `${number || "disposal-settlement"}.pdf`,
  });
