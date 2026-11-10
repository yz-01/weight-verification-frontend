/**
 * Which filters 垃圾清运's header figures are read with (F8, audit #13).
 *
 * The head office's 原工地清运 / 原废料订单 cards open this page on one kind
 * with `counted=1` and, for one project, `project=`. The list below then shows
 * just those - and the header's 清运 N · 废料订单 M and the 数量 / 车次 / 重量
 * line used to go on counting every record of the company above it. Now both
 * kinds' figures are read with the page's project and `counted`, and the
 * shown kind's figures also with the status filter its list applies, so the
 * header describes the list under it. The 全部 tab has no filters.
 *
 * The two kinds are still counted apart (D06); only the filter is shared.
 */
export type ClearanceKind = "all" | "disposal" | "dispatch";

/**
 * What each kind's list filters on besides project and `counted`. 工地清运's
 * clearance company and dates (I27) too: the header's 数量 / 车次 / 重量 is
 * then that company's for that period - what is settled with it.
 */
const OWN_FILTERS: Record<"disposal" | "dispatch", readonly string[]> = {
  // 「异常记录」 (JB149): the header counts the abnormal jobs it lists.
  disposal: ["status", "supplier", "date_from", "date_to", "abnormal"],
  dispatch: ["state", "waste_type"],
};

const SHARED_FILTERS = ["project", "counted"] as const;

function pick(params: URLSearchParams, keys: readonly string[]) {
  const picked: Record<string, string> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value) picked[key] = value;
  }
  return picked;
}

export function clearanceFigureFilters(
  kind: ClearanceKind,
  params: URLSearchParams,
): Record<"disposal" | "dispatch", Record<string, string>> {
  if (kind === "all") return { disposal: {}, dispatch: {} };
  return {
    disposal: pick(params, [
      ...SHARED_FILTERS,
      ...(kind === "disposal" ? OWN_FILTERS.disposal : []),
    ]),
    dispatch: pick(params, [
      ...SHARED_FILTERS,
      ...(kind === "dispatch" ? OWN_FILTERS.dispatch : []),
    ]),
  };
}

/** The page's tabs: the three kinds, and 工地清运's 「异常记录」 view (JB149). */
export type ClearanceTab = ClearanceKind | "abnormal";

/**
 * Where each tab goes (JB149, 补充 第 1 点). 「异常记录」 is the 工地清运 list
 * with `abnormal=1` - as 材料管理's 「Reject 不合格」 is the receipts list with
 * `acceptance=REJECTED` - and between those two the project, clearance
 * company and dates the reader chose go along, as `MaterialTabs` carries them.
 */
export function clearanceTabHref(tab: ClearanceTab, params: URLSearchParams): string {
  if (tab === "all" || tab === "dispatch") return `/waste-clearance?kind=${tab}`;
  const next = new URLSearchParams({ kind: "disposal" });
  if (tab === "abnormal") next.set("abnormal", "1");
  for (const key of ["project", "supplier", "date_from", "date_to"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return `/waste-clearance?${next.toString()}`;
}
