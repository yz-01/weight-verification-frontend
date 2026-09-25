/** Technical support centre API (module 15). */
import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  APIIntegration,
  ActivationStatus,
  BugReport,
  BugSeverity,
  BugState,
  DeviceMaintenance,
  OperationMode,
  RemoteOperation,
  RemoteSession,
  SupportTicket,
  TicketComment,
  TechnicalSupportSummary,
  TestStatus,
  TicketPriority,
  TicketState,
  TicketType,
} from "@/interfaces/support";
import { api, download, toastSuccess } from "@/services/api-client";

export interface TicketPayload { type: TicketType; priority: TicketPriority; title: string; description: string; company?: string | null; assigned_to?: string | null; environment?: string; steps_to_reproduce?: string; expected_result?: string; actual_result?: string; due_date?: string | null; estimated_hours?: string | null; actual_hours?: string | null; resolution_notes?: string; }
export interface BugPayload { title: string; description: string; severity: BugSeverity; module?: string; company?: string | null; environment?: string; steps_to_reproduce?: string; expected_result?: string; actual_result?: string; }
export interface IntegrationPayload { company: string; api_name: string; endpoint?: string; linked_integration?: string | null; integration_date: string; test_status?: TestStatus; live_status?: ActivationStatus; test_result?: string; notes?: string; }
export interface DevicePayload { company: string; type: string; device_type: string; device_id: string; linked_device?: string | null; installed_on?: string | null; installation_location?: string; test_status?: TestStatus; activation_status?: ActivationStatus; firmware_version?: string; sim_status?: string; signal_strength?: number | null; operation_mode?: OperationMode; scheduled_date: string; description: string; }

export const getTickets = (query?: ListQuery): Promise<Paginated<SupportTicket>> => api.list("/api/support-tickets/get_tickets/", query);
export async function createTicket(payload: TicketPayload) { const row = await api.post<SupportTicket>("/api/support-tickets/create_ticket/", payload); toastSuccess("support.toast.created"); return row; }
/**
 * Edit a ticket that is already open.
 *
 * The backend has accepted this since the module was written and no screen ever
 * called it, so a ticket raised with the wrong company, priority or description
 * could only ever be moved along its states, never corrected (F-101).
 */
export async function updateTicket(id: string, payload: Partial<TicketPayload>) {
  const row = await api.patch<SupportTicket>(
    `/api/support-tickets/${id}/update_ticket/`,
    payload,
  );
  toastSuccess("support.toast.updated");
  return row;
}

/**
 * Add a comment to a ticket.
 *
 * `is_internal` keeps a note between staff. It is a real field on the record
 * rather than a convention, so the screen has to make the difference obvious -
 * a note written as internal and shown to the customer is worse than no note.
 */
export async function addTicketComment(
  id: string,
  body: string,
  isInternal: boolean,
) {
  const row = await api.post<TicketComment>(
    `/api/support-tickets/${id}/add_comment/`,
    { body, is_internal: isInternal },
  );
  toastSuccess("support.toast.commentAdded");
  return row;
}

export async function transitionTicket(id: string, state: TicketState, note = "") { const row = await api.post<SupportTicket>(`/api/support-tickets/${id}/transition_ticket/`, { state, note }); toastSuccess("support.toast.transitioned"); return row; }

export const getBugs = (query?: ListQuery): Promise<Paginated<BugReport>> => api.list("/api/bug-reports/get_bugs/", query);
export async function createBug(payload: BugPayload) { const row = await api.post<BugReport>("/api/bug-reports/create_bug/", payload); toastSuccess("support.toast.bugCreated"); return row; }
export async function updateBug(id: string, payload: Partial<{ severity: BugSeverity; state: BugState; module: string; root_cause: string; fix_description: string; fixed_in_version: string }>) { const row = await api.patch<BugReport>(`/api/bug-reports/${id}/update_bug/`, payload); toastSuccess("support.toast.updated"); return row; }

export const getAPIIntegrations = (query?: ListQuery): Promise<Paginated<APIIntegration>> => api.list("/api/support-api-integrations/get_integrations/", query);
export async function createAPIIntegration(payload: IntegrationPayload) { const row = await api.post<APIIntegration>("/api/support-api-integrations/create_integration/", payload); toastSuccess("support.toast.integrationCreated"); return row; }
export async function updateAPIIntegration(id: string, payload: Partial<IntegrationPayload>) { const row = await api.patch<APIIntegration>(`/api/support-api-integrations/${id}/update_integration/`, payload); toastSuccess("support.toast.updated"); return row; }

export const getMaintenance = (query?: ListQuery): Promise<Paginated<DeviceMaintenance>> => api.list("/api/device-maintenance/get_maintenance/", query);
export async function createMaintenance(payload: DevicePayload) { const row = await api.post<DeviceMaintenance>("/api/device-maintenance/create_maintenance/", payload); toastSuccess("support.toast.deviceCreated"); return row; }
export async function completeMaintenance(id: string, payload: { work_performed: string; labor_hours?: string | null; result_notes?: string; test_status?: TestStatus; activation_status?: ActivationStatus; next_maintenance_date?: string | null }) { const row = await api.post<DeviceMaintenance>(`/api/device-maintenance/${id}/complete_maintenance/`, payload); toastSuccess("support.toast.updated"); return row; }
export async function remoteOperate(id: string, operation: RemoteOperation, mode: OperationMode, reason: string, configuration: Record<string, unknown> = {}, firmwareVersion = "") { const result = await api.post<{ mode: OperationMode; operation: RemoteOperation; result: string; device: DeviceMaintenance }>(`/api/device-maintenance/${id}/remote_operate/`, { operation, mode, reason, configuration, firmware_version: firmwareVersion }); toastSuccess("support.toast.remoteCompleted"); return result; }

export const getTechnicalSupportSummary = (): Promise<TechnicalSupportSummary> => api.get("/api/technical-support-reports/get_summary/");
export function exportTechnicalSupportReport(dataset: string, format: "pdf" | "xlsx", title: string, columns: Array<{ key: string; label: string }>) { return download("/api/technical-support-reports/export_report/", { method: "POST", body: { dataset, format, title, columns, empty_label: "" }, fallbackFilename: `technical-${dataset}.${format}` }); }

/**
 * Remote-operation history (15.2.6, kept permanently by 15.2.8).
 *
 * Every remote configure / test / restart / firmware upgrade already writes a
 * session row. Nothing read them back, so a maintenance record that the
 * requirement says must be preserved forever was write-only.
 */
export const getRemoteSessions = (query?: ListQuery): Promise<Paginated<RemoteSession>> =>
  api.list("/api/remote-sessions/get_sessions/", query);
