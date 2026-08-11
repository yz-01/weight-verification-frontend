/** The Cloud Weighing Engine. */

export type ScaleProtocol =
  | "mt_continuous_short"
  | "generic_json"
  | "sma"
  | "mt_8142"
  | "mt_8530"
  | "pt6s3";

export type WeightUnit = "kg" | "lb" | "g";

export type SessionState =
  | "OPEN"
  | "ON_SCALE"
  | "STABLE"
  | "COMPLETED"
  | "VOID";

export type SessionVerdict = "PENDING" | "VALID" | "INVALID";

export type WeighDirection = "GROSS" | "TARE";

/**
 * Why a weighing was rejected.
 *
 * The first six come from the requirements and catch physical tampering. The
 * rest catch tampering with the data itself — a gateway withholding packets,
 * an instrument reconfigured to report a swinging load as settled.
 */
export type AnomalyCode =
  | "SINGLE_READING_ONLY"
  | "NO_CONTINUOUS_STREAM"
  | "SUDDEN_DROP"
  | "SUDDEN_RISE"
  | "STREAM_INTERRUPTED"
  | "MID_SESSION_TARE"
  | "WEIGHT_FREEZE"
  | "DUPLICATE_WEIGHING"
  | "DISPATCH_REQUIRED"
  | "REWEIGH_LIMIT"
  | "SEQ_GAP"
  | "STABLE_FLAG_MISMATCH"
  | "SIGNATURE_INVALID"
  | "CLOCK_SKEW"
  | "FRAME_PARSE_FAILED"
  | "FRAME_MISMATCH"
  | "PLATE_MISMATCH";

/** Every code, for callers that must supply a label for each one. */
export const ANOMALY_CODES: AnomalyCode[] = [
  "SINGLE_READING_ONLY",
  "NO_CONTINUOUS_STREAM",
  "SUDDEN_DROP",
  "SUDDEN_RISE",
  "STREAM_INTERRUPTED",
  "MID_SESSION_TARE",
  "WEIGHT_FREEZE",
  "DUPLICATE_WEIGHING",
  "DISPATCH_REQUIRED",
  "REWEIGH_LIMIT",
  "SEQ_GAP",
  "STABLE_FLAG_MISMATCH",
  "SIGNATURE_INVALID",
  "CLOCK_SKEW",
  "FRAME_PARSE_FAILED",
  "FRAME_MISMATCH",
  "PLATE_MISMATCH",
];

export interface RecyclingSite {
  id: string;
  company: string;
  company_code: string;
  company_name: string;
  code: string;
  name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  latitude: string | null;
  longitude: string | null;
  contact_person: string;
  contact_phone: string;
  is_active: boolean;
  scale_count?: number;
  created_at: string;
}

export interface RecyclingSitePayload {
  code: string;
  name: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  contact_person?: string;
  contact_phone?: string;
  is_active?: boolean;
}

export interface Scale {
  id: string;
  company: string;
  company_code: string;
  company_name: string;
  site: string;
  site_name: string;
  code: string;
  name: string;
  protocol: ScaleProtocol;
  unit: WeightUnit;
  manufacturer: string;
  model_number: string;
  serial_number: string;
  capacity_kg: string | null;
  division_kg: string | null;
  calibration_certificate_no: string;
  calibration_expiry: string | null;
  /** A weighing on a lapsed bridge is not evidence of anything. */
  calibration_expired: boolean;
  is_active: boolean;
  gateway_count?: number;
  created_at: string;
}

export interface ScalePayload {
  site: string;
  code: string;
  name: string;
  protocol: ScaleProtocol;
  unit?: WeightUnit;
  manufacturer?: string;
  model_number?: string;
  serial_number?: string;
  capacity_kg?: string | null;
  division_kg?: string | null;
  calibration_certificate_no?: string;
  calibration_expiry?: string | null;
  is_active?: boolean;
}

export interface GatewayDevice {
  id: string;
  scale: string;
  scale_name: string;
  device_id: string;
  firmware_version: string;
  notes: string;
  last_seen_at: string | null;
  last_seq: number | null;
  clock_offset_ms: number | null;
  is_online: boolean;
  is_active: boolean;
  created_at: string;
}

export interface GatewayInstallerManifest {
  version: number;
  device_id: string;
  site_id: string;
  site_name: string;
  scale_id: string;
  scale_name: string;
  protocol: string;
  unit: string;
  ingest_url: string;
  heartbeat_url: string;
  auth: {
    device_id_header: string;
    signature_header: string;
    signature: string;
    secret: string;
  };
  delivery: {
    persist_sequence_on_gateway: boolean;
    retry_on: number[];
    backoff_seconds: number[];
    batch_size: number;
  };
}

export interface WeighAnomaly {
  id: string;
  code: AnomalyCode;
  detected_at: string;
  device_ts: number | null;
  /** The readings that triggered it, so a verdict can be checked not retold. */
  evidence: Record<string, string | number | boolean | null>;
  /** The thresholds in force at the time, not today's. */
  params_used: Record<string, number>;
}

export interface WeighAnomalyRow extends WeighAnomaly {
  session: string;
  session_no: string;
  scale: string;
  scale_code: string;
  scale_name: string;
  company: string;
  company_name: string;
}

export interface WeighSessionRow {
  id: string;
  company: string;
  company_code: string;
  company_name: string;
  session_no: string;
  scale: string;
  scale_name: string;
  site: string;
  site_name: string;
  dispatch_no: string | null;
  project: string | null;
  project_code: string | null;
  project_name: string | null;
  recycler: string | null;
  recycler_name: string | null;
  vehicle_plate: string;
  direction: WeighDirection;
  state: SessionState;
  verdict: SessionVerdict;
  attempt_no: number;
  requires_review: boolean;
  started_at: string | null;
  ended_at: string | null;
  stable_weight_kg: string | null;
  reading_count: number;
  anomaly_count?: number;
}

export interface WeighSessionDetail extends WeighSessionRow {
  stable_at: string | null;
  peak_weight_kg: string | null;
  ruleset_snapshot: {
    ruleset_id?: string;
    scope?: string;
    version?: number;
    effective_from?: string;
    params?: Record<string, number>;
  };
  first_reading_hash: string;
  last_reading_hash: string;
  anomalies: WeighAnomaly[];
  created_at: string;
}

export interface WeightReading {
  id: string;
  seq: number | null;
  /** What the instrument saw, in epoch milliseconds. */
  device_ts: number;
  /** When it reached the platform. Divergence separates a network fault from
   * an instrument that stopped reporting. */
  server_ts: number;
  weight_kg: string;
  unit: WeightUnit;
  is_stable: boolean;
  is_net: boolean;
  hash: string;
}

export interface SessionTrace {
  session_id: string;
  count: number;
  readings: WeightReading[];
  /** Frozen with the session, so the chart draws the thresholds that judged
   * this weighing rather than whatever is configured now. */
  params: Record<string, number>;
  /** The stretch the sudden-change rules actually ran over, as the engine
   * computed it. Sent rather than re-derived on the client, so the chart and
   * the verdict cannot drift apart. Null when the weighing never settled. */
  measurement_from_ts: number | null;
  measurement_to_ts: number | null;
}

export interface ChainVerification {
  intact: boolean;
  reading_count: number;
  breaks: Array<{
    reading_id: string;
    device_ts: number;
    reason: "content_altered" | "link_broken";
    stored_hash?: string;
    computed_hash?: string;
    expected_prev_hash?: string;
    stored_prev_hash?: string;
  }>;
}

export interface WeighSessionSummary {
  total: number;
  by_verdict: Partial<Record<SessionVerdict, number>>;
  requires_review: number;
}

export interface RuleParameter {
  key: string;
  default: number;
}

export interface WeighingRuleSet {
  id: string;
  scope: "PLATFORM" | "COMPANY" | "SCALE";
  company: string | null;
  scale: string | null;
  version: number;
  params: Record<string, number>;
  resolved_params: Record<string, number>;
  effective_from: string;
  is_active: boolean;
  change_reason: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}
