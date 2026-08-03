export type IntegrationKind =
  | "ERP"
  | "ACCOUNTING"
  | "MYINVOIS"
  | "GOVERNMENT_API"
  | "CCTV"
  | "ANPR"
  | "IOT"
  | "AI"
  | "DRONE"
  | "TOWER_CRANE"
  | "RF"
  | "WEBHOOK";

export type IntegrationStatus = "DISABLED" | "READY" | "DEGRADED" | "ERROR";

export interface IntegrationConfig {
  id: string;
  company: string;
  company_name: string | null;
  kind: IntegrationKind;
  name: string;
  base_url: string;
  auth_type: string;
  settings: Record<string, unknown>;
  status: IntegrationStatus;
  is_enabled: boolean;
  has_secret: boolean;
  last_success_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface IntegrationDevice {
  id: string;
  gateway: string | null;
  gateway_device_id: string | null;
  integration: string | null;
  integration_name: string | null;
  device_type: string;
  device_id: string;
  site: string | null;
  site_name: string | null;
  project: string | null;
  project_name: string | null;
  scale: string | null;
  scale_name: string | null;
  firmware_version: string;
  settings: Record<string, unknown>;
  last_seen_at: string | null;
  is_online: boolean;
  has_secret: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntegrationPayload {
  kind: IntegrationKind;
  name: string;
  base_url?: string;
  auth_type?: string;
  secret?: string;
  settings?: Record<string, unknown>;
  is_enabled?: boolean;
}

export interface IntegrationDevicePayload {
  integration?: string | null;
  device_type: string;
  device_id: string;
  site?: string | null;
  project?: string | null;
  scale?: string | null;
  firmware_version?: string;
  secret?: string;
  settings?: Record<string, unknown>;
  is_active?: boolean;
}
