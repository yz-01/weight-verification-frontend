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

/** What each kind's list filters on besides project and `counted`. */
const OWN_FILTERS: Record<"disposal" | "dispatch", readonly string[]> = {
  disposal: ["status"],
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
