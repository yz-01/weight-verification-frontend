/**
 * 垃圾清运's tabs and the filters its header figures are read with.
 *
 * JB248 (客户 11-23b 事项 1): 「菜单内分为：全部｜垃圾清运｜废料处理…两种业务的
 * 车次、重量及总数量分别累计，不混合统计」. One page, one list of clearance
 * jobs; 垃圾清运 and 废料处理 are its two kinds (`clearance_kind`), each with
 * its own line of 笔数 / 车次 / 重量. 废料订单 is not here any more: it is back
 * in 环保材料管理 (`/dispatches`).
 *
 * F8 (audit #13) still holds: the head office's card opens this page with
 * `counted=1` and maybe `project=`, and the header then counts what the list
 * under it shows - the page's project, `counted`, and the list's own status,
 * clearance company, dates and 「异常记录」 filter. Both kinds' lines are
 * read with those same filters, each on its own kind.
 */
import type { DisposalClearanceKind } from "@/interfaces/contractor-ops";

/**
 * The address's `kind`: 清运结算管理 (JB287, in 「全部」's place), or one of the
 * two businesses.
 */
export type ClearanceKind = "settlement" | "garbage" | "scrap";

/** The tabs: 清运结算管理｜垃圾清运｜废料处理, and 「异常记录」 (JB149). */
export type ClearanceTab = ClearanceKind | "abnormal";

/** Each kind's tab and the record value it lists. */
export const CLEARANCE_KIND_OF: Record<"garbage" | "scrap", DisposalClearanceKind> = {
  garbage: "GARBAGE",
  scrap: "SCRAP",
};

/**
 * The tab an address asks for. JB287 (客户 11-27: 「「全部」页面…调整为「清运结算
 * 管理」」): 「全部」 is gone, so its old link `kind=all` and `kind=disposal`
 * (every link written before JB248: notices, task cards) open 清运结算管理;
 * a `?record=` they carry opens that job over it. An unknown value is
 * 清运结算管理 too.
 */
export function clearanceKindOf(asked: string | null): ClearanceKind {
  return asked === "garbage" || asked === "scrap" ? asked : "settlement";
}

/**
 * An address that needs the list of jobs rather than 清运结算管理: 【新增申请】
 * (`create=1`) or Multi Engine's 「添加资料」 (`pack=`) on an old `kind=disposal`
 * link. It goes to 垃圾清运 with everything it carried; null when it stays.
 */
export function clearanceListHref(params: URLSearchParams): string | null {
  if (clearanceKindOf(params.get("kind")) !== "settlement" || params.get("abnormal") === "1") return null;
  if (params.get("create") !== "1" && !params.get("pack")) return null;
  const next = new URLSearchParams(params.toString());
  next.set("kind", "garbage");
  return `/waste-clearance?${next.toString()}`;
}

const FIGURE_FILTERS = [
  "project",
  "counted",
  "status",
  "supplier",
  "date_from",
  "date_to",
  "abnormal",
] as const;

export function clearanceFigureFilters(
  params: URLSearchParams,
): Record<DisposalClearanceKind, Record<string, string>> {
  const picked: Record<string, string> = {};
  for (const key of FIGURE_FILTERS) {
    const value = params.get(key);
    if (value) picked[key] = value;
  }
  return {
    GARBAGE: { ...picked, clearance_kind: "GARBAGE" },
    SCRAP: { ...picked, clearance_kind: "SCRAP" },
  };
}

/**
 * Where each tab goes. The project, clearance company and dates the reader
 * chose go along (as `MaterialTabs` carries them); 「异常记录」 is both kinds
 * with `kind=all` (the address it always had, so its links keep working) and
 * `abnormal=1` (JB149: 材料管理's 「验收不合格」 is the receipts list with
 * `acceptance=REJECTED`).
 */
export function clearanceTabHref(tab: ClearanceTab, params: URLSearchParams): string {
  const next = new URLSearchParams({ kind: tab === "abnormal" ? "all" : tab });
  if (tab === "abnormal") next.set("abnormal", "1");
  for (const key of ["project", "supplier", "date_from", "date_to"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return `/waste-clearance?${next.toString()}`;
}

/**
 * Where an old `/waste-clearance?kind=dispatch` link goes now: 废料订单 in
 * 环保材料管理, with what the link carried (`counted`, `project`, a filter).
 */
export function dispatchListHref(params: URLSearchParams): string {
  const next = new URLSearchParams(params.toString());
  next.delete("kind");
  const query = next.toString();
  return query ? `/dispatches?${query}` : "/dispatches";
}
