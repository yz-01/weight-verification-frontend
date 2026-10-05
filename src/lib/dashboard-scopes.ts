/**
 * The two levels of the contractor's home (C11).
 *
 * Head office asked for a 公司总部 Dashboard over the whole company and a
 * 项目 Dashboard for one project, with a way to move between them. The
 * company level is the home page (`/dashboard`); the project level is the
 * daily dashboard that used to be the home page, now at `/dashboard/project`.
 * The switch sits in the company banner at the top of both.
 *
 * The old address of the project level - `/dashboard?project=<id>`, or the
 * reserved `?scope=` - forwards to its new place (`legacyDashboardTarget`).
 */
export type DashboardScope = "company" | "project";

export interface DashboardScopeOption {
  key: DashboardScope;
  /** Message key under `dashboard.scope`. */
  labelKey: string;
  href: string;
}

export const DASHBOARD_SCOPES: readonly DashboardScopeOption[] = [
  { key: "company", labelKey: "company", href: "/dashboard" },
  { key: "project", labelKey: "project", href: "/dashboard/project" },
];

/**
 * Where an old `/dashboard?...` address belongs now, or null to stay on the
 * company level. Only the contractor console has two levels.
 */
export function legacyDashboardTarget(search: string): string | null {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  params.delete("scope");
  if (scope === "company") {
    const rest = params.toString();
    return rest ? null : "/dashboard";
  }
  if (scope === "project" || params.get("project")) {
    const rest = params.toString();
    return rest ? `/dashboard/project?${rest}` : "/dashboard/project";
  }
  return null;
}
