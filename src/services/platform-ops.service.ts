import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  NotificationRow,
  NotificationSummary,
  SystemEvent,
  SystemStatus,
} from "@/interfaces/platform-ops";
import { api, toastSuccess } from "@/services/api-client";

export function getNotifications(
  query: ListQuery,
): Promise<Paginated<NotificationRow>> {
  return api.list<NotificationRow>(
    "/api/notifications/get_notifications/",
    query,
  );
}

export function getUnreadNotificationCount(): Promise<NotificationSummary> {
  return api.get<NotificationSummary>(
    "/api/notifications/get_unread_count/",
  );
}

export function markNotificationRead(id: string): Promise<NotificationRow> {
  return api.post<NotificationRow>(`/api/notifications/${id}/mark_read/`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const result = await api.post<{ updated: number }>(
    "/api/notifications/mark_all_read/",
  );
  toastSuccess("notifications.toast.allRead");
  return result.updated;
}

export function getSystemStatus(): Promise<SystemStatus> {
  return api.get<SystemStatus>("/api/platform-ops/get_system_status/");
}

export async function captureSystemStatus(): Promise<unknown> {
  const snapshot = await api.post(
    "/api/platform-ops/capture_system_status/",
  );
  toastSuccess("monitoring.toast.captured");
  return snapshot;
}

export function getSystemEvents(
  query: ListQuery,
): Promise<Paginated<SystemEvent>> {
  return api.list<SystemEvent>("/api/platform-ops/get_events/", query);
}
