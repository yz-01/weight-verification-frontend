/**
 * Where 人工费用统计 and 人工月结单 live (JB295b, 客户 11-28 事项 2): 「在现有
 * 人员名单页面上方，完善人工费用统计及人工月结单两个栏目」 - two tabs on the
 * 人员名单 page, `/site-workers?tab=labour` and `?tab=statements`. The old
 * addresses `/labour-costs` and `/labour-statements` send here.
 */

export type LabourTab = "labour" | "statements";

/** The 人员名单 page on a labour tab, keeping the given address values. */
export function labourTabHref(tab: LabourTab, values: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams({ tab });
  for (const [key, value] of Object.entries(values)) {
    if (value && !(key === "project" && value === "all")) params.set(key, value);
  }
  return `/site-workers?${params.toString()}`;
}

/** One 人工月结单, opened in its tab (any state). */
export function labourStatementHref(id: string): string {
  return labourTabHref("statements", { state: "all", statement: id });
}

/** An old address's query, as plain strings (the first of each). */
export function plainQuery(query: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
}
