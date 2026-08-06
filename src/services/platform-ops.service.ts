import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  AdminNotificationRow,
  NotificationChannelStatus,
  NotificationDeliveryRecord,
  NotificationStatusRecord,
} from "@/interfaces/admin-notification";
import type {
  AdminDashboardData,
  MonitoringOverview,
  NotificationRow,
  NotificationSummary,
  SystemEvent,
  SystemStatus,
  SystemEventResolution,
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

export function getAdminNotifications(
  query: ListQuery,
): Promise<Paginated<AdminNotificationRow>> {
  return api.list<AdminNotificationRow>(
    "/api/notifications/get_admin_notifications/",
    query,
  );
}

export function markAdminNotificationRead(
  id: string,
): Promise<AdminNotificationRow> {
  return api.post<AdminNotificationRow>(`/api/notifications/${id}/mark_read/`);
}

export function markAdminNotificationUnread(
  id: string,
): Promise<AdminNotificationRow> {
  return api.post<AdminNotificationRow>(`/api/notifications/${id}/mark_unread/`);
}

export function removeAdminNotification(id: string): Promise<void> {
  return api.delete(`/api/notifications/${id}/remove_notification/`);
}

export function getNotificationChannelStatus(): Promise<{
  channels: NotificationChannelStatus[];
}> {
  return api.get("/api/notifications/get_channel_status/");
}

export function getNotificationDeliveryRecords(
  query: ListQuery = {},
): Promise<Paginated<NotificationDeliveryRecord>> {
  return api.list("/api/notifications/get_notification_records/", {
    ...query,
    record_type: "DELIVERY",
  });
}

export function getNotificationStatusRecords(
  query: ListQuery = {},
): Promise<Paginated<NotificationStatusRecord>> {
  return api.list("/api/notifications/get_notification_records/", {
    ...query,
    record_type: "STATUS",
  });
}

export function sendAdminNotification(input: {
  company_id: string;
  kind: string;
  title: string;
  message: string;
  channels: Array<"IN_APP" | "EMAIL" | "PUSH">;
}): Promise<{ sent: number }> {
  return api.post("/api/notifications/send_notification/", input);
}

export function getAdminDashboard(): Promise<AdminDashboardData> {
  return api.get<AdminDashboardData>(
    "/api/platform-ops/get_admin_dashboard/",
  );
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

export function getMonitoringOverview(): Promise<MonitoringOverview> {
  return api.get<MonitoringOverview>(
    "/api/platform-ops/get_monitoring_overview/",
  );
}

export async function recordSystemEventResolution(
  eventId: string,
  input: { status: "ACKNOWLEDGED" | "RESOLVED"; note: string },
): Promise<SystemEventResolution> {
  const result = await api.post<SystemEventResolution>(
    `/api/platform-ops/${eventId}/record_event_resolution/`,
    input,
  );
  toastSuccess("monitoring.toast.resolutionSaved");
  return result;
}
