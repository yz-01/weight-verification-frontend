import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  DriverTaskLivePosition,
  DriverTaskPosition,
} from "@/interfaces/recycler";
import { api } from "@/services/api-client";

export function getDriverRouteHistory(
  taskId: string,
  query: ListQuery = {},
): Promise<Paginated<DriverTaskPosition>> {
  return api.list<DriverTaskPosition>(
    "/api/task-positions/get_route_history/",
    { ...query, task: taskId },
  );
}

export function getDriverLivePositions(
  query: ListQuery = {},
): Promise<Paginated<DriverTaskLivePosition>> {
  return api.list<DriverTaskLivePosition>(
    "/api/task-positions/get_live_positions/",
    query,
  );
}
