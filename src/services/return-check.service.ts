/**
 * 退货核对 (JB188, 客户 11-13): 「待核对／已核对」, 【退货核对】 and one 核对.
 *
 * `/api/material-return-checks/`: the list of checks (「已核对」, newest first,
 * following the top bar), one check (its returns, the shared details), the
 * suppliers with returns waiting to be checked, the check itself (one
 * request: the ticked returns, the remark and the vouchers, signed with the
 * six-digit PIN `material_return.check`) and its PDF, 「退货核对单」.
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import { api, fetchAsFile, toastSuccess } from "@/services/api-client";

/** One line of 「已核对」: 核对编号｜供应商｜笔数｜日期｜核对人. */
export interface ReturnCheckRow {
  id: string;
  /** 「MO-RN001」. */
  check_no: string;
  supplier: string;
  supplier_name: string;
  /** 笔数: every return the check holds. */
  return_count: number;
  checked_at: string;
  checked_by_name: string;
}

/** One check, as 查看 shows it. */
export interface ReturnCheck extends ReturnCheckRow {
  note: string;
  /** The returns this reader sees, as the badge's window (图 2) draws them. */
  returns: MaterialOutgoing[];
  /** 「另有 N 笔在别的项目」: returns of this check on projects not seen. */
  hidden_count: number;
  /** The one project all its returns are on, or null: what its log rows name. */
  project: string | null;
}

/** A supplier with returns waiting to be checked, and how many. */
export interface PendingReturnSupplier {
  id: string;
  name: string;
  count: number;
}

export const getReturnChecks = (query: ListQuery = {}): Promise<Paginated<ReturnCheckRow>> =>
  api.list<ReturnCheckRow>("/api/material-return-checks/get_checks/", query);

export const getReturnCheck = (id: string) =>
  api.get<ReturnCheck>(`/api/material-return-checks/${id}/get_check/`);

export const getPendingReturnSuppliers = (project?: string) =>
  api.get<{ results: PendingReturnSupplier[] }>(
    "/api/material-return-checks/get_pending_suppliers/",
    project ? { project } : {},
  );

/**
 * 【确认核对】: the ticked returns of one supplier, the remark and the files -
 * one request, all or nothing. The PIN dialog opens on the server's
 * `sign_off_pin_required` and the same request goes again with it.
 */
export async function createReturnCheck(payload: {
  supplier: string;
  returns: readonly string[];
  note: string;
  files: readonly File[];
}): Promise<ReturnCheck> {
  const body = new FormData();
  body.append("supplier", payload.supplier);
  for (const id of payload.returns) body.append("returns", id);
  if (payload.note.trim()) body.append("note", payload.note.trim());
  for (const file of payload.files) body.append("files", file);
  const check = await api.post<ReturnCheck>("/api/material-return-checks/create_check/", body);
  toastSuccess("returnChecks.saved", { number: check.check_no });
  return check;
}

/** 「退货核对单」: the PDF that 预览 · 打印 · 导出 · 发送 act on. */
export const returnCheckPdfFile = (id: string, lang: string, number: string) =>
  fetchAsFile(`/api/material-return-checks/${id}/get_check_pdf/`, {
    method: "GET",
    query: { lang },
    fallbackFilename: `${number || "return-check"}.pdf`,
  });
