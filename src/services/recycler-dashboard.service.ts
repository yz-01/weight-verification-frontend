import type { RecyclerDashboardData } from "@/interfaces/recycler-dashboard";
import { api } from "@/services/api-client";

export function getRecyclerDashboard(): Promise<RecyclerDashboardData> {
  return api.get<RecyclerDashboardData>(
    "/api/recycler-dashboard/get-dashboard/",
  );
}
