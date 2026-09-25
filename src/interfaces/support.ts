/** Technical support centre (module 15) interfaces. */
export type TicketType = "BUG" | "SYSTEM_ISSUE" | "API_INTEGRATION" | "WEIGHBRIDGE_INSTALL" | "AI_CCTV" | "ANPR" | "DEVICE_MAINTENANCE" | "OTHER";
export type TicketState = "PENDING" | "IN_PROGRESS" | "TESTING" | "COMPLETED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type BugSeverity = "MINOR" | "NORMAL" | "MAJOR" | "CRITICAL";
export type BugState = "OPEN" | "CONFIRMED" | "IN_PROGRESS" | "FIXED" | "VERIFIED" | "CLOSED" | "WONT_FIX";
export type TestStatus = "PENDING" | "PASSED" | "FAILED";
export type ActivationStatus = "INACTIVE" | "ACTIVE" | "SUSPENDED";
export type OperationMode = "SIMULATED" | "LIVE";
export type RemoteOperation = "CONFIGURE" | "TEST" | "RESTART" | "FIRMWARE_UPGRADE";

export interface SupportTicket {
  id: string; code: string; type: TicketType; state: TicketState; priority: TicketPriority;
  company: string | null; company_code: string | null; company_name: string | null;
  reported_by_name: string | null; assigned_to: string | null; assigned_to_name: string | null;
  title: string; description: string; environment: string; steps_to_reproduce: string;
  expected_result: string; actual_result: string; resolution_notes: string;
  resolved_at: string | null; closed_at: string | null; due_date: string | null;
  estimated_hours: string | null; actual_hours: string | null; created_at: string; updated_at: string;
  /** The backend already returns these with the ticket; nothing read them. */
  comments: TicketComment[];
}
export interface TicketComment {
  id: string; ticket: string; author: string | null; author_name: string | null;
  body: string; is_internal: boolean; created_at: string;
}
export interface BugReport { id: string; ticket: string; bug_code: string; severity: BugSeverity; state: BugState; module: string; root_cause: string; fix_description: string; fixed_in_version: string; title: string; description: string; assigned_to_name: string | null; company_name: string | null; created_at: string; }
export interface APIIntegration { id: string; code: string; company: string; company_code: string; company_name: string; api_name: string; endpoint: string; linked_integration: string | null; integration_date: string; owner_name: string | null; test_status: TestStatus; live_status: ActivationStatus; test_result: string; notes: string; }
export interface DeviceMaintenance { id: string; code: string; type: string; device_type: string; device_id: string; company: string; company_code: string; company_name: string; linked_device: string | null; installed_on: string | null; installed_by_name: string | null; installation_location: string; test_status: TestStatus; activation_status: ActivationStatus; firmware_version: string; is_online: boolean; last_online_at: string | null; sim_status: string; signal_strength: number | null; operation_mode: OperationMode; remote_configuration: Record<string, unknown>; scheduled_date: string; completed_date: string | null; description: string; work_performed: string; technician_name: string | null; labor_hours: string | null; result_notes: string; next_maintenance_date: string | null; }
export interface TechnicalSupportSummary { tickets: number; bugs: number; api_integrations: number; installations: number; maintenance: number; completion_rate: number; }

/**
 * One remote-operation session: 15.2.6 lists remote configure, test, restart
 * and firmware upgrade, and 15.2.8 keeps the record permanently.
 * `result` reads `SIMULATED_SUCCESS` while the outbound device channel is
 * still simulated, so the log never claims a device was really touched.
 */
export interface RemoteSession {
  id: string;
  ticket: string | null;
  company: string;
  company_name: string;
  operator: string | null;
  operator_name: string | null;
  session_type: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  description: string;
  actions_performed: string;
  result: string;
  created_at: string;
}
