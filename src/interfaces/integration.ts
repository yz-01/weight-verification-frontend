export type IntegrationKind =
  | "ERP"
  | "ACCOUNTING"
  | "MYINVOIS"
  | "GOVERNMENT_API"
  | "API_GATEWAY"
  | "CCTV"
  | "ANPR"
  | "ACCESS_CONTROL"
  | "RFID"
  | "FACE_RECOGNITION"
  | "VISITOR_MANAGEMENT"
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
  /** Which business events this connection asked for, by name. */
  subscribed_events: string[];
  /** What this kind of connection is allowed to ask for. Server-decided. */
  available_events: string[];
  status: IntegrationStatus;
  is_enabled: boolean;
  has_secret: boolean;
  last_success_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface IntegrationDelivery {
  id: string;
  integration: string;
  integration_name: string;
  event_type: string;
  status: "PENDING" | "SENT" | "FAILED";
  response_status: number | null;
  error: string;
  attempted_at: string;
  created_at: string;
}

export interface IntegrationDevice {
  id: string;
  company: string;
  company_name: string | null;
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
  provisioning?: {
    heartbeat_url: string;
    access_event_url?: string;
    gate_event_url?: string;
    device_record_id: string;
    device_id: string;
    secret: string;
    signature: string;
    device_header: string;
    signature_header: string;
  };
}

export interface IntegrationPayload {
  kind: IntegrationKind;
  name: string;
  base_url?: string;
  auth_type?: string;
  secret?: string;
  settings?: Record<string, unknown>;
  is_enabled?: boolean;
  /** Which business events this connection should be sent. */
  subscribed_events?: string[];
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

/**
 * One image or clip a field device pushed.
 *
 * `file_url` is a signed, expiring link and is empty once the bytes have been
 * purged on retention. `sha256` outlives the bytes on purpose: after a purge
 * the record can still say what was there, which is a different and much
 * better answer than an empty result.
 */
export interface DeviceMedia {
  id: string;
  device: string;
  device_name: string;
  kind: "PHOTO" | "CLIP";
  client_media_id: string;
  source_model: string;
  source_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  captured_at: string;
  received_at: string;
  retain_until: string;
  file_url: string;
  is_purged: boolean;
  purged_at: string | null;
  metadata: Record<string, unknown>;
}

/** One plate read, card swipe or face match a vendor adapter reported. */
export interface ThirdPartyAccessEvent {
  id: string;
  project: string | null;
  project_name: string | null;
  device: string;
  device_id: string;
  access_pass: string | null;
  pass_no: string | null;
  credential_type: "QR" | "ANPR" | "RFID" | "FACE" | "VISITOR_ID";
  recognition_result: "RECOGNIZED" | "FAILED";
  credential_hint: string;
  direction: "ENTRY" | "EXIT";
  occurred_at: string;
  received_at: string;
  gate_name: string;
  verification_result: "ALLOWED" | "DENIED";
  reason_code: string;
}

/**
 * One structured observation a field device pushed.
 *
 * `value` arrives as a string because it is a decimal on the server, and a
 * crane's hook load must not lose digits on its way through a JavaScript
 * number. Format it; do not do arithmetic on it.
 */
export interface DeviceTelemetry {
  id: string;
  device: string;
  device_name: string;
  device_type: string;
  site: string | null;
  site_name: string | null;
  project: string | null;
  project_name: string | null;
  kind: "OBSERVATION" | "EVENT" | "STATUS" | "ALERT";
  metric: string;
  client_event_id: string;
  value: string | null;
  unit: string;
  payload: Record<string, unknown>;
  observed_at: string;
  received_at: string;
}

/**
 * What the platform can ask a controller to do.
 *
 * About the effect, never the wire format: a gate is a gate whether its
 * controller speaks Modbus or a vendor HTTP API. The brand-specific part
 * lives in the adapter in front of the device.
 */
export type DeviceCommandKind =
  | "GATE_OPEN"
  | "GATE_CLOSE"
  | "LED_MESSAGE"
  | "VOICE_ANNOUNCEMENT"
  | "OTHER";

/**
 * Where a command got to.
 *
 * ACKNOWLEDGED is the only state that means the controller did it. Every
 * other one means it did not, and the console has to show that difference
 * rather than a tick.
 */
export type DeviceCommandState =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "REJECTED"
  | "TIMED_OUT"
  | "CLOSED_MANUALLY";

export interface DeviceCommand {
  id: string;
  device: string;
  device_name: string;
  device_type: string;
  kind: DeviceCommandKind;
  kind_label: string;
  payload: Record<string, unknown>;
  client_command_id: string;
  state: DeviceCommandState;
  state_label: string;
  /**
   * The one field anything safety-relevant may read.
   *
   * True only for ACKNOWLEDGED. It is named rather than derived on the screen
   * so nothing can quietly come to treat "timed out" as "the barrier is up".
   */
  controller_acted: boolean;
  issued_at: string;
  expires_at: string | null;
  delivered_at: string | null;
  settled_at: string | null;
  detail: string;
  issued_by: string | null;
  issued_by_name: string | null;
  settled_by: string | null;
  settled_by_name: string | null;
}

export interface DeviceCommandPayload {
  device: string;
  kind: DeviceCommandKind;
  client_command_id: string;
  payload?: Record<string, unknown>;
  timeout_seconds?: number;
}
