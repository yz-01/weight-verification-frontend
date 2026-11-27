/**
 * 退货核对 (JB188, 客户 11-13): 「待核对／已核对」, 【退货核对】 and one 核对.
 *
 * `/api/material-return-checks/`: the list of checks (「已核对」, newest first,
 * following the top bar), one check (its returns, the shared details), the
 * suppliers with returns waiting to be checked, the check itself (one
 * request: the ticked returns, the remark and the vouchers, signed with the
 * six-digit PIN `material_return.check`) and its PDF, 「退货核对单」.
 *
 * JB277 (客户 11-26 事项 18): every check carries 凭证编号 and at least one
 * voucher, both required. JB278 (事项 19): the same for 材料领用 (`kind:
 * "ISSUE"`, by 所属公司, numbers MO-IS…) and a 结算 after 核对 for both kinds.
 * JB280 (事项 21): the equipment rental statements' 核对与结算 (`kind:
 * "RENTAL"`) are the same calls under `/api/equipment-rental-statements/`.
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import { api, fetchAsFile, toastSuccess } from "@/services/api-client";
import { getLabourPendingCompanies } from "@/services/labour-statement.service";
import type { RentalStatementRow } from "@/services/rental-statement.service";

/** What a 核对 / 结算 is about - each its own numbers and lists. */
export type ReconKind = "RETURN" | "ISSUE" | "RENTAL" | "LABOUR";

/** Where a kind's calls live. JB295: 人工结算单 under `/api/labour-statements/`. */
export function reconBase(kind: ReconKind): string {
  if (kind === "LABOUR") return "/api/labour-statements/";
  return kind === "RENTAL" ? "/api/equipment-rental-statements/" : "/api/material-return-checks/";
}

/** `?kind=` for the material calls; the rental and labour ones need none. */
function kindQuery(kind: ReconKind): Record<string, string> {
  return kind === "RENTAL" || kind === "LABOUR" ? {} : { kind };
}

/** One line of 「已核对」: 核对编号｜供应商｜笔数｜日期｜核对人. */
export interface ReturnCheckRow {
  id: string;
  kind?: ReconKind;
  /** 「MO-RN001」 / 「MO-IS001」 / 「EQ-RC001」. */
  check_no: string;
  supplier: string | null;
  /** The supplier's, the 所属公司's or the equipment company's name. */
  supplier_name: string;
  /** 笔数: every record the check holds. */
  return_count: number;
  checked_at: string;
  checked_by_name: string;
  /** 凭证编号 (JB277); empty on a check saved before it. */
  voucher_no?: string;
  settlement?: string | null;
  settlement_no?: string;
  settled_at?: string | null;
}

/** One 材料领用 in a check or its pick list. */
export interface IssueCheckRow {
  id: string;
  reference_no: string;
  project: string;
  project_name: string;
  at: string;
  equipment_company: string;
  equipment_no: string;
  recipient_name: string;
  issuer_name: string;
  materials: { material: string; quantity: string; unit: string }[];
  /** RM, for a reader who sees amounts; otherwise null. */
  amount: string | null;
  status: string;
}

/** The settlement a check was settled in. */
export interface CheckSettlement {
  id: string;
  settlement_no: string;
  settled_by_name: string;
  settled_at: string;
  voucher_no: string;
}

/** One check, as 查看 shows it. */
export interface ReturnCheck extends Omit<ReturnCheckRow, "settlement"> {
  note: string;
  /** The returns this reader sees, as the badge's window (图 2) draws them. */
  returns: MaterialOutgoing[];
  /** 材料领用 (JB278). */
  issues?: IssueCheckRow[];
  /** 设备租赁月结单 (JB280); 人工结算单 for kind LABOUR (JB295, their own shape). */
  statements?: RentalStatementRow[];
  amount_total?: string | null;
  /** 「另有 N 笔在别的项目」: records of this check on projects not seen. */
  hidden_count: number;
  /** The one project all its records are on, or null: what its log rows name. */
  project: string | null;
  settlement?: CheckSettlement | null;
}

/** A supplier (or 所属公司 / equipment company) with records waiting, and how many. */
export interface PendingReturnSupplier {
  id: string;
  name: string;
  count: number;
}

export const getReturnChecks = (query: ListQuery = {}, kind: ReconKind = "RETURN"): Promise<Paginated<ReturnCheckRow>> =>
  api.list<ReturnCheckRow>(`${reconBase(kind)}get_checks/`, { ...query, ...kindQuery(kind) });

export const getReturnCheck = (id: string, kind: ReconKind = "RETURN") =>
  api.get<ReturnCheck>(`${reconBase(kind)}${id}/get_check/`);

export async function getPendingReturnSuppliers(
  project?: string,
  kind: ReconKind = "RETURN",
): Promise<{ results: PendingReturnSupplier[] }> {
  // JB295: the labour companies come as `{company_key, company_name, statements}`.
  if (kind === "LABOUR") {
    const data = await getLabourPendingCompanies(project);
    return {
      results: (data.rows ?? []).map((row) => ({
        id: row.company_key,
        name: row.company_name,
        count: row.statements?.length ?? 0,
      })),
    };
  }
  return api.get<{ results: PendingReturnSupplier[] }>(`${reconBase(kind)}get_pending_suppliers/`, {
    ...kindQuery(kind),
    ...(project ? { project } : {}),
  });
}

/** 领用的【核对与结算】's pick list: one 所属公司's issues waiting. */
export const getPendingIssues = (company: string, project?: string) =>
  api.get<{ results: IssueCheckRow[]; count: number; total: number; truncated: boolean }>(
    "/api/material-return-checks/get_pending_issues/",
    { company, ...(project ? { project } : {}) },
  );

/**
 * 【确认核对】: the ticked records of one supplier / 所属公司 / equipment
 * company, 凭证编号, the remark and the files - one request, all or nothing.
 * The PIN dialog opens on the server's `sign_off_pin_required` and the same
 * request goes again with it.
 */
export async function createReturnCheck(payload: {
  kind?: ReconKind;
  supplier: string;
  returns: readonly string[];
  voucherNo: string;
  note: string;
  files: readonly File[];
}): Promise<ReturnCheck> {
  const kind = payload.kind ?? "RETURN";
  const body = new FormData();
  if (kind === "ISSUE") {
    body.append("kind", "ISSUE");
    body.append("company", payload.supplier);
  } else if (kind === "LABOUR") {
    // JB295: one 所属公司 per check (`<supplier uuid>`, `note:<text>` or `self`).
    body.append("company_key", payload.supplier);
  } else {
    body.append("supplier", payload.supplier);
  }
  const field = kind === "RENTAL" || kind === "LABOUR" ? "statements" : "returns";
  for (const id of payload.returns) body.append(field, id);
  body.append("voucher_no", payload.voucherNo.trim());
  if (payload.note.trim()) body.append("note", payload.note.trim());
  for (const file of payload.files) body.append("files", file);
  // Written out, so the route check (core.tests.test_ui_reachability) finds both.
  const url =
    kind === "LABOUR"
      ? "/api/labour-statements/create_check/"
      : kind === "RENTAL"
        ? "/api/equipment-rental-statements/create_check/"
        : "/api/material-return-checks/create_check/";
  const check = await api.post<ReturnCheck>(url, body);
  toastSuccess("returnChecks.saved", { number: check.check_no });
  return check;
}

/** 「退货核对单」 / 「材料领用核对单」: the PDF that 预览 · 打印 · 导出 · 发送 act on. */
export const returnCheckPdfFile = (id: string, lang: string, number: string) =>
  fetchAsFile(`/api/material-return-checks/${id}/get_check_pdf/`, {
    method: "GET",
    query: { lang },
    fallbackFilename: `${number || "return-check"}.pdf`,
  });

/* ------------------------------------------------------------------ */
/* 结算 (JB278 / JB280)                                                  */
/* ------------------------------------------------------------------ */

/** A check waiting to be settled, in 【结算】's pick list. */
export interface SettleableCheck {
  id: string;
  check_no: string;
  count: number;
  checked_at: string;
  checked_by_name: string;
  voucher_no: string;
  amount: string | null;
}

/** One party's checks waiting to be settled. */
export interface SettleableParty {
  id: string;
  name: string;
  checks: SettleableCheck[];
}

/** One line of 「已结算」. */
export interface SettlementRow {
  id: string;
  kind: ReconKind;
  settlement_no: string;
  party_name: string;
  check_count: number;
  amount_total: string | null;
  voucher_no: string;
  settled_at: string;
  settled_by_name: string;
}

export interface Settlement extends SettlementRow {
  note: string;
  checks: ReturnCheckRow[];
  hidden_count: number;
  project: string | null;
  shows_amount: boolean;
}

export const getSettleable = (kind: ReconKind, project?: string) =>
  api.get<{ results: SettleableParty[] }>(`${reconBase(kind)}get_settleable/`, {
    ...kindQuery(kind),
    ...(project ? { project } : {}),
  });

export const getSettlements = (kind: ReconKind, query: ListQuery = {}): Promise<Paginated<SettlementRow>> =>
  api.list<SettlementRow>(`${reconBase(kind)}get_settlements/`, { ...query, ...kindQuery(kind) });

export const getSettlement = (id: string, kind: ReconKind) =>
  api.get<Settlement>(`${reconBase(kind)}${id}/get_settlement/`);

/** 【确认结算】: checks of one party, 凭证编号, files, remark - PIN-signed. */
export async function createSettlement(payload: {
  kind: ReconKind;
  checks: readonly string[];
  voucherNo: string;
  note: string;
  files: readonly File[];
}): Promise<Settlement> {
  const body = new FormData();
  if (payload.kind !== "RENTAL" && payload.kind !== "LABOUR") body.append("kind", payload.kind);
  for (const id of payload.checks) body.append("checks", id);
  body.append("voucher_no", payload.voucherNo.trim());
  if (payload.note.trim()) body.append("note", payload.note.trim());
  for (const file of payload.files) body.append("files", file);
  const url =
    payload.kind === "LABOUR"
      ? "/api/labour-statements/create_settlement/"
      : payload.kind === "RENTAL"
        ? "/api/equipment-rental-statements/create_settlement/"
        : "/api/material-return-checks/create_settlement/";
  const settlement = await api.post<Settlement>(url, body);
  toastSuccess("jb278.settledToast", { number: settlement.settlement_no });
  return settlement;
}
