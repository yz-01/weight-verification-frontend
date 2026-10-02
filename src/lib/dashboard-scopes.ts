/**
 * The two levels of the contractor's home (reserved for Phase 9a, C11–C19).
 *
 * Head office asked for a 公司总部 Dashboard over the whole company and a
 * 项目 Dashboard for one project, with a way to move between them. Only the
 * project level exists today - the contractor home, with its project picker -
 * so the switch stays hidden: a choice with one option is not a choice.
 *
 * Phase 9a builds the company page and turns `company` on here; the switch in
 * the dashboard header then appears without any change to the frame.
 */
export type DashboardScope = "company" | "project";

export interface DashboardScopeOption {
  key: DashboardScope;
  /** Message key under `dashboard.scope`. */
  labelKey: string;
  href: string;
  available: boolean;
}

export const DASHBOARD_SCOPES: readonly DashboardScopeOption[] = [
  { key: "company", labelKey: "company", href: "/dashboard?scope=company", available: false },
  { key: "project", labelKey: "project", href: "/dashboard", available: true },
];

/** The levels this console can switch between right now. */
export function availableDashboardScopes(): DashboardScopeOption[] {
  return DASHBOARD_SCOPES.filter((scope) => scope.available);
}
