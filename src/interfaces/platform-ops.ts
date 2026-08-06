export type NotificationKind =
  | "SYSTEM"
  | "APPROVAL"
  | "EVENT"
  | "REMINDER"
  | "EXCEPTION";

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  data: Record<string, unknown>;
  event: string | null;
  read_at: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationSummary {
  total: number;
  by_kind: Partial<Record<NotificationKind, number>>;
}

export type HealthStatus = "ok" | "configured" | "degraded" | "unhealthy" | "not_running" | "not_configured";
export type MonitoringMode = "SIMULATED" | "LIVE";

export interface SystemStatus {
  status: HealthStatus;
  checked_at: string;
  server: {
    status: HealthStatus;
    hostname: string;
    process_id: number;
    process_uptime_seconds: number;
  };
  api: {
    status: HealthStatus;
    [key: string]: unknown;
  };
  database: {
    status: HealthStatus;
    latency_ms: number | null;
  };
  storage: {
    status: HealthStatus;
    backend?: string;
    usage_bytes?: number;
    [key: string]: unknown;
  };
  queue: {
    by_state: Record<string, number>;
    oldest_waiting_at: string | null;
    workers: {
      status: HealthStatus;
      total: number;
      online: number;
      stale: number;
      stopped: number;
      last_seen_at: string | null;
    };
  };
  devices: { total: number; online: number; offline: number };
  errors_24h: number;
  failed_jobs_24h: number;
  performance: Record<string, unknown>;
  latest_snapshot_at: string | null;
}

export interface SystemEvent {
  id: string;
  company: string | null;
  company_name: string | null;
  project: string | null;
  project_name: string | null;
  source: string;
  event_type: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  message: string;
  payload: Record<string, unknown>;
  actor_id: string | null;
  device_id: string;
  occurred_at: string;
  correlation_id: string;
  resolution_status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  handled_by_name: string | null;
  resolution_note: string;
  resolved_at: string | null;
  created_at: string;
}

export interface IntegrationMonitor {
  key: string;
  name: string;
  mode: MonitoringMode;
  status: HealthStatus;
  configured: number;
  enabled: number;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  successes_24h: number;
  failures_24h: number;
  last_checked_at: string | null;
}

export interface MonitoringOverview {
  generated_at: string;
  platform: {
    online_contractors: number;
    online_recyclers: number;
    online_projects: number;
    active_projects: number;
    online_users: number;
    active_users_today: number;
    active_companies: number;
  };
  cwe: {
    mode: MonitoringMode;
    status: HealthStatus;
    total_scales: number;
    active_scales: number;
    online_gateways: number;
    offline_gateways: number;
    weighings_today: number;
    anomalies_today: number;
    reweighs_today: number;
    in_progress: number;
    scales: Array<{
      id: string;
      code: string;
      name: string;
      company: string;
      site: string;
      protocol: string;
      is_active: boolean;
      gateway_count: number;
      online: boolean;
      last_seen_at: string | null;
      current_weight_kg: string | number | null;
      current_weight_at_ms: number | null;
    }>;
  };
  cctv: IntegrationMonitor;
  anpr: IntegrationMonitor;
  api_gateway: {
    mode: MonitoringMode;
    status: HealthStatus;
    requests_24h: number;
    failures_24h: number;
    success_rate: number;
    average_latency_ms: number;
    max_latency_ms: number;
  };
  sync: {
    mode: MonitoringMode;
    status: HealthStatus;
    configured: number;
    attempts_24h: number;
    sent_24h: number;
    failed_24h: number;
    pending_24h: number;
    success_rate: number;
    integrations: Array<{
      id: string;
      name: string;
      kind: string;
      company: string;
      mode: MonitoringMode;
      status: string;
      last_success_at: string | null;
      last_error: string;
    }>;
  };
  exceptions: {
    open: number;
    acknowledged: number;
    resolved: number;
    last_24h: number;
  };
  runtime: {
    uptime_seconds: number;
    exceptions_24h: number;
    average_response_ms: number;
    api_success_rate: number;
    sync_success_rate: number;
    worker_status: {
      status: HealthStatus;
      total: number;
      online: number;
      stale: number;
      stopped: number;
      last_seen_at: string | null;
    };
  };
  services: Array<{
    key: string;
    name: string;
    mode: MonitoringMode;
    status: HealthStatus;
    last_checked_at: string | null;
    failures_24h: number;
  }>;
}

export interface SystemEventResolution {
  id: string;
  event: string;
  status: "ACKNOWLEDGED" | "RESOLVED";
  note: string;
  handled_by: string;
  handled_by_name: string;
  handled_at: string;
  created_at: string;
}

export type DashboardMarkerKind =
  | "PROJECT"
  | "RECYCLER"
  | "SCALE"
  | "HEADQUARTERS";

export interface AdminDashboardMarker {
  id: string;
  kind: DashboardMarkerKind;
  latitude: number | string;
  longitude: number | string;
  name: string;
  company_id: string;
  company_name: string;
  company_type: "CONTRACTOR" | "RECYCLER";
  project_id?: string;
  project_name?: string;
  state: string;
  status: string;
  address: string;
  recycler_names?: string[];
  today_orders?: number;
  today_weight_kg?: number | string;
  scale_code?: string;
}

export interface AdminDashboardTrendPoint {
  month: string;
  value: number | string;
}

export interface AdminDashboardData {
  generated_at: string;
  map: { markers: AdminDashboardMarker[]; states: string[] };
  platform: {
    companies: number;
    contractors: number;
    recyclers: number;
    projects: number;
    active_companies: number;
    inactive_companies: number;
    users: number;
    online_users: number;
    projects_by_status: Record<string, number>;
  };
  business_today: {
    orders: number;
    completed_orders: number;
    recovered_weight_kg: number | string;
    settlement_amount: number | string;
    service_commission: number | string;
  };
  subscriptions: {
    active: number;
    expiring_soon: number;
    expired: number;
    paused: number;
    not_started: number;
    renewed_today: number;
    monthly_revenue: number | string;
  };
  commission: {
    business_weight_kg: number | string;
    settlement_amount: number | string;
    receivable: number | string;
    received: number | string;
    outstanding: number | string;
  };
  pending: {
    company_reviews: number;
    contractor_reviews: number;
    recycler_reviews: number;
    payments: number;
    system_exceptions: number;
    customer_service: number;
    support_tickets: number;
  };
  weighing: {
    online_scales: number;
    offline_scales: number;
    today_sessions: number;
    today_anomalies: number;
    today_reweighs: number;
    service_status: HealthStatus;
  };
  system: SystemStatus;
  notifications: NotificationRow[];
  trends: {
    companies: AdminDashboardTrendPoint[];
    contractors: AdminDashboardTrendPoint[];
    recyclers: AdminDashboardTrendPoint[];
    orders: AdminDashboardTrendPoint[];
    weight_kg: AdminDashboardTrendPoint[];
    saas_revenue: AdminDashboardTrendPoint[];
    commission_revenue: AdminDashboardTrendPoint[];
  };
}
