import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  AdminNotificationRow,
  NotificationChannelStatus,
  NotificationDeliveryRecord,
  NotificationStatusRecord,
} from "@/interfaces/admin-notification";
import type {
  AdminDashboardData,
  JobRun,
  MonitoringOverview,
  NotificationRow,
  NotificationSummary,
  SystemEvent,
  ScheduledJob,
  SystemStatus,
  SystemEventResolution,
  WorkerStatusSummary,
} from "@/interfaces/platform-ops";
import type {
  DeviceMedia,
  ThirdPartyAccessEvent,
} from "@/interfaces/integration";
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

export async function dismissNotification(id: string): Promise<void> {
  await api.delete(`/api/notifications/${id}/dismiss/`);
}

export async function sendProjectNotification(input: {
  project_id: string;
  recipient_scope: "ALL" | "ROLE" | "PEOPLE";
  recipient_ids?: string[];
  recipient_role_codes?: string[];
  title: string;
  message: string;
}): Promise<{ sent: number; project_id: string }> {
  const result = await api.post<{ sent: number; project_id: string }>(
    "/api/notifications/send_project_notification/",
    input,
  );
  toastSuccess("notifications.toast.sent", { count: result.sent });
  return result;
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

/**
 * Plate reads across every tenant, for the platform monitoring page.
 *
 * Deliberately not the site-access module's list: that one is scoped to one
 * contractor and gated by a contractor permission, so a platform operator
 * watching every yard gets a 403 from it. Same data, different audience.
 */
export function getRecentAccessReads(
  query: ListQuery = {},
): Promise<Paginated<ThirdPartyAccessEvent>> {
  return api.list<ThirdPartyAccessEvent>(
    "/api/platform-ops/get_recent_access_reads/",
    query,
  );
}

/** Captures across every tenant, for the same page and the same reason. */
export function getRecentDeviceMediaForPlatform(
  query: ListQuery = {},
): Promise<Paginated<DeviceMedia>> {
  return api.list<DeviceMedia>(
    "/api/platform-ops/get_recent_device_media/",
    query,
  );
}

/**
 * Background jobs (F-077).
 *
 * The platform runs its own recurring work — billing generation, subscription
 * reminders, announcement publication, monitoring snapshots. All nine
 * endpoints existed with no caller, so an administrator could neither see a
 * failed run nor re-run it.
 */
export function getScheduledJobs(
  query?: ListQuery & { kind?: string },
): Promise<Paginated<ScheduledJob>> {
  return api.list<ScheduledJob>("/api/platform-ops/get_jobs/", query);
}

export function getJobRuns(
  query?: ListQuery & { job?: string; state?: string },
): Promise<Paginated<JobRun>> {
  return api.list<JobRun>("/api/platform-ops/get_job_runs/", query);
}

export async function runJobNow(id: string): Promise<JobRun> {
  const run = await api.post<JobRun>(`/api/platform-ops/${id}/run_job_now/`, {});
  toastSuccess("monitoring.jobs.toast.queued");
  return run;
}

export async function setScheduledJobActive(
  id: string,
  isActive: boolean,
): Promise<ScheduledJob> {
  const job = await api.patch<ScheduledJob>(
    `/api/platform-ops/${id}/update_job/`,
    { is_active: isActive },
  );
  toastSuccess("monitoring.jobs.toast.updated");
  return job;
}

export function getWorkerStatus(): Promise<WorkerStatusSummary> {
  return api.get("/api/platform-ops/get_worker_status/");
}
