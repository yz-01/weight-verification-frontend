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

export type HealthStatus = "ok" | "configured" | "degraded" | "unhealthy" | "not_running";

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
  created_at: string;
}
