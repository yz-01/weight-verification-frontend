import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  FieldStaffPosition,
  WorkforcePresence,
} from "@/interfaces/site-operations";
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

export function recordAutomaticFieldStaffPosition(payload: {
  latitude: string;
  longitude: string;
  accuracy_m?: string;
  original_occurred_at: string;
  client_event_id: string;
}): Promise<{ matched: boolean; position: FieldStaffPosition | null }> {
  return api.post<{ matched: boolean; position: FieldStaffPosition | null }>(
    "/api/field-staff-positions/record_auto_position/",
    payload,
    { silent: true },
  );
}

export function getFieldStaffLastPositions(
  query: ListQuery = {},
): Promise<Paginated<FieldStaffPosition>> {
  return api.list<FieldStaffPosition>(
    "/api/field-staff-positions/get_last_positions/",
    query,
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

/**
 * On-site headcount and its breakdown (requirement 15.2.3).
 *
 * Presence here is the geofence verdict, not a gate scan: the requirement is
 * explicit that a worker counts as on site once inside the project fence.
 */
export function getWorkforcePresence(params: {
  project?: string;
  department?: string;
  trade?: string;
}): Promise<WorkforcePresence> {
  return api.get<WorkforcePresence>(
    "/api/field-staff-positions/get_workforce_presence/",
    params,
  );
}
