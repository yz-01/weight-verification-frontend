import type { ListQuery, Paginated } from "@/interfaces/api";
import type { FieldStaffPosition } from "@/interfaces/site-operations";
import { api } from "@/services/api-client";

export function getFieldStaffLivePositions(
  query: ListQuery = {},
): Promise<Paginated<FieldStaffPosition>> {
  return api.list<FieldStaffPosition>(
    "/api/field-staff-positions/get_live_positions/",
    query,
  );
}

export function getFieldStaffRouteHistory(
  projectId: string,
  query: ListQuery = {},
): Promise<Paginated<FieldStaffPosition>> {
  return api.list<FieldStaffPosition>(
    "/api/field-staff-positions/get_route_history/",
    { ...query, project: projectId },
  );
}

export function recordFieldStaffPosition(payload: {
  project: string;
  latitude: string;
  longitude: string;
  accuracy_m?: string;
  original_occurred_at: string;
  client_event_id: string;
}): Promise<FieldStaffPosition> {
  return api.post<FieldStaffPosition>(
    "/api/field-staff-positions/record_position/",
    payload,
  );
}

export function stopFieldStaffLocationSharing(payload: {
  project: string;
  client_event_id: string;
}): Promise<FieldStaffPosition | null> {
  return api.post<FieldStaffPosition | null>(
    "/api/field-staff-positions/stop_sharing/",
    payload,
  );
}
