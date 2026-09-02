import type { RecyclerDashboardData } from "@/interfaces/recycler-dashboard";
import { api } from "@/services/api-client";

/**
 * @param site One yard to narrow to, or omitted for the whole company.
 *
 * Not every figure narrows: stock, outbound and billing are kept per company
 * and have no yard column. The response's `site.scoped` / `site.company_wide`
 * lists say which is which, so the screen can label the ones that did not.
 */
export function getRecyclerDashboard(
  site?: string,
): Promise<RecyclerDashboardData> {
  return api.get<RecyclerDashboardData>(
    "/api/recycler-dashboard/get-dashboard/",
    site ? { site } : undefined,
  );
}
