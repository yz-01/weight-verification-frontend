/**
 * 人工费用 (JB295, 客户 11-27i): `/api/labour/`.
 *
 * The client: 「支持按人员、工种及所属公司设定人工单价。按实际核实的工作天数、正常
 * 工时及超时工时累计计算人工费用。……电子围栏的进场及离场记录作为出勤依据，实际
 * 计费工时及工作天数必须经过负责人核对确认。」
 *
 * Two groups of people are priced (Lucas 11-27 final): 人员名单 workers
 * (`worker:<uuid>`) and App 账号 (`user:<uuid>`, their automatic 进场 / 离开).
 * Every amount is null for a reader without 「金额查看」 (`amounts_hidden`).
 * The PIN-signed calls get the PIN box from the API client when the server
 * asks for it (`sign_off_pin_required`).
 */

import { api, download, toastSuccess } from "@/services/api-client";
import { exportBody, exportQuery, type ExportRequest } from "@/services/contractor.service";

/** 人员名单 (roster) or App 账号 (app). */
export type LabourGroup = "roster" | "app";
/** A 所属公司: on the supplier list, typed in, 本公司 (`self`) or not filled in (`none`). */
export type LabourCompanyKind = "supplier" | "note" | "self" | "none";
/** 按人员 / 按所属公司 + 工种 / 按工种 / 按所属公司 - the most specific one wins. */
export type LabourScope = "PERSON" | "COMPANY_TRADE" | "TRADE" | "COMPANY" | "EQUIPMENT";
/**
 * 日薪 / 时薪, or 「已含在设备租赁费用内」 (JB295b, 客户 11-28 第 6 点: the
 * operator's labour is inside the equipment rental and is not counted again).
 */
export type LabourMethod = "DAILY" | "HOURLY" | "IN_RENTAL";

/** The order a person's rate is looked for: the first one found counts. */
export const LABOUR_SCOPES: readonly LabourScope[] = ["PERSON", "COMPANY_TRADE", "TRADE", "COMPANY"];
// (`EQUIPMENT` is no rate row: a day of the bound operator of a rented machine, JB295b.)
export const LABOUR_METHODS: readonly LabourMethod[] = ["DAILY", "HOURLY", "IN_RENTAL"];

export interface LabourCompany {
  key: string;
  name: string;
  kind: LabourCompanyKind;
}

export interface LabourTrade {
  key: string;
  name: string;
}

export interface LabourPerson {
  key: string;
  name: string;
  group: LabourGroup;
  company_key: string;
  company_name: string;
  trade_name: string;
  is_active: boolean;
  /** JB295b: a roster worker's app account with the same phone - counted as one person. */
  linked_user?: { key: string; name: string } | null;
}

/** JB295b: two roster rows (or two accounts) with one phone on the project - not merged. */
export interface LabourWarning {
  kind: "same_phone_twice";
  keys: string[];
  names?: string[];
  phone?: string;
}

export interface LabourOptions {
  companies: LabourCompany[];
  trades: LabourTrade[];
  people: LabourPerson[];
  warnings?: LabourWarning[];
}

/**
 * JB295b: why a person's labour is not counted - 「已含在设备租赁费用内」, set
 * by a rate, or found because they operate a rented machine (`equipment_no`).
 */
export interface LabourInRental {
  reason: string;
  equipment_no?: string | null;
}

/** The rate a day was priced with. */
export interface LabourRateUsed {
  scope: LabourScope;
  method: LabourMethod;
  unit_price: string | null;
  overtime_rate: string | null;
  effective_from: string;
}

/** One 人工单价 row (append-only; a change is a new row). */
export interface LabourRate {
  id: string;
  scope: LabourScope;
  person_key: string;
  person_name: string;
  company_key: string;
  company_name: string;
  trade: string;
  method: LabourMethod;
  unit_price: string | null;
  overtime_rate: string | null;
  effective_from: string;
  note: string;
  previous: { unit_price: string | null; overtime_rate: string | null; method: LabourMethod; effective_from: string } | null;
  created_by_name: string;
  created_at: string;
}

export interface LabourRatePayload {
  scope: LabourScope;
  person_key?: string;
  company_key?: string;
  trade?: string;
  method: LabourMethod;
  unit_price: string;
  overtime_rate?: string;
  effective_from: string;
  note?: string;
}

/** 正常工时：每天 N 小时 for labour, per project. */
export interface LabourNormalHours {
  daily_hours: string;
  effective_from: string | null;
  history: { daily_hours: string; effective_from: string; by: string; at: string }[];
}

/** One stay: 进场 → 离开 (or none). */
export interface LabourSession {
  start: string;
  end: string | null;
  /** EXIT 离开 / SYSTEM 系统结束 / MISSING 缺离场. */
  end_kind: "EXIT" | "SYSTEM" | "MISSING";
  source: "app" | "roster";
  refs: string[];
}

export type LabourFlag = "missing_exit" | "system_exit";

export interface LabourAdjustment {
  by: string;
  at: string;
  reason: string;
  worked: boolean;
  normal_hours: string;
  overtime_hours: string;
}

/** 按日: one person, one day. */
export interface LabourDayRow {
  person_key: string;
  person_name: string;
  group: LabourGroup;
  company_key: string;
  company_name: string;
  trade_name: string;
  date: string;
  sessions: LabourSession[];
  total_hours: string;
  normal_hours: string;
  overtime_hours: string;
  worked: boolean;
  flags: LabourFlag[];
  adjusted: LabourAdjustment | null;
  /** 已确认 (the month) or in a 结算单: the day cannot be adjusted. */
  locked: "confirmed" | "statement" | null;
  rate: LabourRateUsed | null;
  normal_amount: string | null;
  overtime_amount: string | null;
  day_amount: string | null;
  /** JB295b: the day's labour is inside the equipment rental. */
  in_rental?: LabourInRental | null;
}

/** A rate in force for part of a month. */
export interface LabourRatePiece {
  scope: LabourScope;
  method: LabourMethod;
  unit_price: string | null;
  overtime_rate: string | null;
  from: string;
  to: string;
}

export interface LabourMonthPerson {
  person_key: string;
  person_name: string;
  group: LabourGroup;
  company_key: string;
  company_name: string;
  trade_name: string;
  days_worked: number;
  normal_hours: string;
  overtime_hours: string;
  missing_exit_count: number;
  system_exit_count: number;
  adjusted_count: number;
  rates: LabourRatePiece[];
  no_rate: boolean;
  /** JB295b: 「已含在设备租赁费用内，不计人工」. */
  in_rental?: LabourInRental | null;
  normal_amount: string | null;
  overtime_amount: string | null;
  labour_amount: string | null;
}

/** 按月: one person, one month. */
export interface LabourMonthRow extends LabourMonthPerson {
  confirmed: { at: string; by: string } | null;
  statement: { id: string; statement_no: string; state: string } | null;
}

export interface LabourTotals {
  days_worked: number;
  normal_hours: string;
  overtime_hours: string;
  normal_amount: string | null;
  overtime_amount: string | null;
  labour_amount: string | null;
}

export interface LabourMonth {
  rows: LabourMonthRow[];
  totals: LabourTotals;
  month_over: boolean;
  amounts_hidden: boolean;
}

export interface LabourDays {
  rows: LabourDayRow[];
  month_locked_people: string[];
}

export interface LabourQuery {
  project: string;
  month: string;
  person?: string;
  company?: string;
  trade?: string;
  flagged?: "1";
}

const BASE = "/api/labour/";

/** Only the filters chosen: an empty one is not sent. */
export function labourParams(query: LabourQuery): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value))) as Record<string, string>;
}

export const getLabourOptions = (project: string) =>
  api.get<LabourOptions>(`${BASE}get_options/`, project ? { project } : {});

export const getLabourRates = (project?: string) =>
  api.get<{ rows: LabourRate[]; amounts_hidden?: boolean }>(`${BASE}get_rates/`, project ? { project } : {});

/** 【价格历史】 of one rate's scope and key, newest first. */
export const getLabourRateHistory = (rate: Pick<LabourRate, "scope" | "person_key" | "company_key" | "trade">) =>
  api.get<{ rows: LabourRate[] }>(`${BASE}get_rate_history/`, {
    scope: rate.scope,
    ...(rate.person_key ? { person_key: rate.person_key } : {}),
    ...(rate.company_key ? { company_key: rate.company_key } : {}),
    ...(rate.trade ? { trade: rate.trade } : {}),
  });

/** 【新增单价】: PIN `labour_rate.set`. */
export async function setLabourRate(payload: LabourRatePayload): Promise<LabourRate> {
  const body: Record<string, string> = {
    scope: payload.scope,
    method: payload.method,
    effective_from: payload.effective_from,
  };
  // 「已含在设备租赁费用内」 has no price (JB295b).
  if (payload.method !== "IN_RENTAL") body.unit_price = payload.unit_price.trim();
  if (payload.scope === "PERSON" && payload.person_key) body.person_key = payload.person_key;
  if ((payload.scope === "COMPANY" || payload.scope === "COMPANY_TRADE") && payload.company_key) {
    body.company_key = payload.company_key;
  }
  if ((payload.scope === "TRADE" || payload.scope === "COMPANY_TRADE") && payload.trade) body.trade = payload.trade;
  if (payload.method !== "IN_RENTAL" && payload.overtime_rate?.trim()) body.overtime_rate = payload.overtime_rate.trim();
  if (payload.note?.trim()) body.note = payload.note.trim();
  const rate = await api.post<LabourRate>("/api/labour/set_rate/", body);
  toastSuccess("jb295.toast.rateSaved");
  return rate;
}

export const getLabourNormalHours = (project: string) =>
  api.get<LabourNormalHours>(`${BASE}get_normal_hours/`, { project });

/** 【正常工时：每天 N 小时】: no PIN; the server keeps who and when. */
export async function setLabourNormalHours(payload: {
  project: string;
  daily_hours: string;
  effective_from: string;
}): Promise<LabourNormalHours> {
  const saved = await api.post<LabourNormalHours>("/api/labour/set_normal_hours/", payload);
  toastSuccess("jb295.toast.normalSaved");
  return saved;
}

export const getLabourDays = (query: LabourQuery) => api.get<LabourDays>(`${BASE}get_days/`, labourParams(query));

/** 【调整】 one day: PIN `labour_hours.adjust`. */
export async function adjustLabourDay(payload: {
  project: string;
  person_key: string;
  date: string;
  worked: boolean;
  normal_hours: string;
  overtime_hours: string;
  reason: string;
}): Promise<LabourDayRow> {
  const row = await api.post<LabourDayRow>("/api/labour/adjust_day/", payload);
  toastSuccess("jb295.toast.adjusted");
  return row;
}

export const getLabourMonth = (query: LabourQuery) => api.get<LabourMonth>(`${BASE}get_month/`, labourParams(query));

/** 【确认本月工时】 for the ticked people: PIN `labour.confirm`. */
export async function confirmLabourMonth(payload: {
  project: string;
  month: string;
  people: readonly string[];
}): Promise<{ confirmed: string[] }> {
  const done = await api.post<{ confirmed: string[] }>("/api/labour/confirm_month/", {
    ...payload,
    people: [...payload.people],
  });
  toastSuccess("jb295.toast.confirmed", { count: done.confirmed.length });
  return done;
}

/** 【取消确认】: reason + PIN `labour.unconfirm`. */
export async function unconfirmLabourMonth(payload: {
  project: string;
  month: string;
  person_key: string;
  reason: string;
}): Promise<LabourMonthRow> {
  const row = await api.post<LabourMonthRow>("/api/labour/unconfirm_month/", payload);
  toastSuccess("jb295.toast.unconfirmed");
  return row;
}

/** 按日, as a file: the rows on screen. */
export function exportLabourDays(request: ExportRequest): Promise<void> {
  return download("/api/labour/export_days/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `labour-days.${request.format}`,
  });
}

/** 按月, as a file: one row per person, then the 合计. */
export function exportLabourMonth(request: ExportRequest, totalLabel?: string): Promise<void> {
  return download("/api/labour/export_month/", {
    method: "POST",
    query: exportQuery(request),
    body: { ...exportBody(request), ...(totalLabel ? { total_label: totalLabel } : {}) },
    fallbackFilename: `labour-month.${request.format}`,
  });
}

/* ------------------------------------------------------------------ */
/* 统计方式 (JB295b, 客户 11-28 第 3 点 「按所属公司、工种及月份统计」)       */
/* ------------------------------------------------------------------ */

export type LabourSummaryGroup = "person" | "company" | "trade";

export interface LabourSummaryFigures {
  people: number;
  days_worked: number;
  normal_hours: string;
  overtime_hours: string;
  /** People with days but no rate: not in the amount (never counted as 0). */
  no_rate_people?: number;
  labour_amount: string | null;
  confirmed_amount: string | null;
  unconfirmed_amount: string | null;
  /** Inside 人工月结单: 待核对 / 已核对 / 已结算. */
  pending_amount?: string | null;
  checked_amount?: string | null;
  settled_amount?: string | null;
}

export interface LabourSummaryRow extends LabourSummaryFigures {
  key: string;
  name: string;
  months: (LabourSummaryFigures & { month: string })[];
}

export interface LabourSummary {
  rows: LabourSummaryRow[];
  totals: LabourSummaryFigures;
  amounts_hidden: boolean;
}

export interface LabourSummaryQuery {
  project: string;
  month_from: string;
  month_to: string;
  group: LabourSummaryGroup;
  company?: string;
  trade?: string;
}

export const getLabourSummary = (query: LabourSummaryQuery) =>
  api.get<LabourSummary>(`${BASE}get_summary/`, Object.fromEntries(
    Object.entries(query).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>);

/** 按所属公司 / 按工种 / 按人员 as a file: the rows on screen, then the 合计. */
export function exportLabourSummary(request: ExportRequest, totalLabel?: string): Promise<void> {
  return download("/api/labour/export_summary/", {
    method: "POST",
    query: exportQuery(request),
    body: { ...exportBody(request), ...(totalLabel ? { total_label: totalLabel } : {}) },
    fallbackFilename: `labour-summary.${request.format}`,
  });
}
