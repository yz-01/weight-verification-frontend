/** The recycler console's records: fleet, trips, the gate, and the money. */

import type { NotificationRow } from "@/interfaces/platform-ops";

export type VehicleType =
  | "LORRY"
  | "TIPPER"
  | "ROLL_ON"
  | "SKIP"
  | "TRAILER"
  | "OTHER";

export const VEHICLE_TYPES: VehicleType[] = [
  "LORRY",
  "TIPPER",
  "ROLL_ON",
  "SKIP",
  "TRAILER",
  "OTHER",
];

export type VehicleWorkStatus =
  | "AVAILABLE"
  | "ON_TASK"
  | "MAINTENANCE"
  | "INACTIVE";

export interface Vehicle {
  id: string;
  plate_no: string;
  vehicle_type: VehicleType;
  brand: string;
  model: string;
  make_model: string;
  payload_capacity_kg: string | null;
  /** Only used by yards weighing against a stored tare. Set via its own action. */
  tare_weight_kg: string | null;
  tare_measured_at: string | null;
  has_stored_tare: boolean;
  max_laden_kg: string | null;
  road_tax_expires_on: string | null;
  insurance_expires_on: string | null;
  permit_expires_on: string | null;
  photo: string | null;
  notes: string;
  is_under_maintenance: boolean;
  is_active: boolean;
  work_status: VehicleWorkStatus;
  current_task_id: string | null;
  current_task_no: string | null;
  created_at: string;
}

export interface VehiclePayload {
  plate_no: string;
  vehicle_type: VehicleType;
  brand?: string;
  model?: string;
  make_model?: string;
  payload_capacity_kg?: string | null;
  max_laden_kg?: string | null;
  road_tax_expires_on?: string | null;
  insurance_expires_on?: string | null;
  permit_expires_on?: string | null;
  photo?: File | null;
  notes?: string;
  is_under_maintenance?: boolean;
  is_active?: boolean;
}

export type DriverWorkStatus =
  | "AVAILABLE"
  | "ON_TASK"
  | "COMPLETED_TODAY"
  | "ON_LEAVE"
  | "INACTIVE";

export interface Driver {
  id: string;
  driver_no: string;
  full_name: string;
  phone: string;
  ic_no: string;
  licence_no: string;
  licence_expires_on: string | null;
  licence_photo: string | null;
  photo: string | null;
  emergency_contact: string;
  notes: string;
  default_vehicle: string | null;
  default_vehicle_plate: string | null;
  user: string | null;
  user_email: string | null;
  login_idle_expiry_days: number;
  language: "en" | "zh" | "zh-TW" | "ms" | null;
  company_name: string;
  work_status: DriverWorkStatus;
  is_online: boolean;
  current_task_id: string | null;
  current_task_no: string | null;
  last_position_at: string | null;
  is_on_leave: boolean;
  is_active: boolean;
  notify_new_tasks: boolean;
  notify_task_changes: boolean;
  notify_system: boolean;
  created_at: string;
}

export interface DriverPayload {
  driver_no?: string;
  full_name: string;
  phone: string;
  ic_no?: string;
  licence_no?: string;
  licence_expires_on?: string | null;
  licence_photo?: File | null;
  photo?: File | null;
  emergency_contact?: string;
  notes?: string;
  default_vehicle?: string | null;
  user?: string | null;
  account_email?: string;
  account_password?: string;
  login_idle_expiry_days?: number;
  is_on_leave?: boolean;
  is_active?: boolean;
}

export interface DriverSummary {
  total: number;
  online: number;
  on_task: number;
  available: number;
  completed_today: number;
  on_leave: number;
  inactive: number;
}

export interface FleetTaskHistory {
  id: string;
  task_no: string;
  dispatch: string | null;
  dispatch_no: string | null;
  project_name: string | null;
  state: TaskState;
  scheduled_for: string | null;
  completed_at: string | null;
  net_weight_kg: string | null;
  weigh_session_id: string | null;
  weigh_session_no: string | null;
}

export interface TaskSummary {
  today_dispatches: number;
  today_completed: number;
  running: number;
  vehicles_used_today: number;
  drivers_used_today: number;
}

export type TaskState =
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "LOADED"
  | "RETURNING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export const TASK_STATES: TaskState[] = [
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "LOADED",
  "RETURNING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
];

/**
 * Which step a trip may go to next.
 *
 * A copy of the backend's table, kept so the screen offers only the buttons
 * that will work. The backend remains the authority — this decides what to
 * show, never what is allowed.
 */
export const TASK_TRANSITIONS: Record<TaskState, TaskState[]> = {
  ASSIGNED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["EN_ROUTE", "CANCELLED", "FAILED"],
  EN_ROUTE: ["ARRIVED", "FAILED"],
  ARRIVED: ["LOADED", "FAILED"],
  LOADED: ["RETURNING", "FAILED"],
  RETURNING: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

export interface TaskPhoto {
  id: string;
  kind: "ARRIVAL" | "LOADING" | "LOADED" | "PLATE" | "ISSUE" | "OTHER";
  image: string;
  watermarked?: string | null;
  client_event_id: string;
  caption: string;
  latitude: string | null;
  longitude: string | null;
  taken_at: string | null;
  created_at: string;
}

export interface DriverTaskTransition {
  id: string;
  client_event_id: string;
  from_state: TaskState;
  to_state: TaskState;
  original_occurred_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  notes: string;
  reason: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
}

export interface DriverTask {
  id: string;
  task_no: string;
  state: TaskState;
  is_running: boolean;
  dispatch: string | null;
  dispatch_no: string | null;
  waste_type: string | null;
  site: string;
  site_name: string;
  vehicle: string;
  vehicle_plate: string;
  driver: string;
  driver_name: string;
  scheduled_for: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  photo_count?: number;
}

export interface DriverTaskDetail extends DriverTask {
  /**
   * The address to drive to. Falls back to the project address on the server,
   * so this is never blank for a task that has a project.
   */
  pickup_address: string;
  /** True when a person typed it, which is when it beats the project pin. */
  pickup_address_is_manual: boolean;
  /*
   * Null, not blank, on a trip with no dispatch. The yard can raise one for a
   * load that simply turned up, and every project field on the serializer
   * carries `default=None` for that case - typing them as plain strings said
   * the opposite and cost a crashed driver screen (F-355).
   */
  project_name: string | null;
  project_address_line_1: string | null;
  project_address_line_2: string | null;
  project_city: string | null;
  project_state: string | null;
  project_postcode: string | null;
  project_latitude: string | null;
  project_longitude: string | null;
  project_geofence_radius_m: number | null;
  contractor_name: string | null;
  site_address_line_1: string;
  site_address_line_2: string;
  site_city: string;
  site_state: string;
  site_postcode: string;
  site_latitude: string | null;
  site_longitude: string | null;
  accepted_at: string | null;
  arrived_at: string | null;
  loaded_at: string | null;
  arrival_latitude: string | null;
  arrival_longitude: string | null;
  notes: string;
  failure_reason: string;
  photos: TaskPhoto[];
  transitions: DriverTaskTransition[];
  latest_position: DriverTaskPosition | null;
  route: DriverTaskPosition[];
  weighing: DriverWeighingSummary | null;
  settlement: import("@/interfaces/waste-outgoing").WasteSettlementSummary | null;
  created_at: string;
  updated_at: string;
  /** Photos held in IndexedDB until connectivity returns. */
  /**
   * Which kinds are queued, not just how many (T-223).
   *
   * The loaded step needs a loading photograph *and* a gate pass, so a count
   * cannot say whether the queued job covers the one that is still missing.
   */
  local_pending_photo_kinds?: string[];
}

export interface DriverWeighingSummary {
  session_id: string;
  session_no: string;
  gross_weight_kg: string | null;
  tare_weight_kg: string | null;
  net_weight_kg: string | null;
  state: string;
  verdict: string;
  requires_review: boolean;
  weighed_at: string | null;
}

export interface DriverDashboard {
  date: string;
  counts: {
    pending: number;
    in_progress: number;
    completed: number;
  };
  current_task: DriverTaskDetail | null;
  latest_notifications: NotificationRow[];
}

export interface DriverNotificationSettings {
  notify_new_tasks: boolean;
  notify_task_changes: boolean;
  notify_system: boolean;
}

export interface RecyclerCommissionSetting {
  id: string;
  name: string;
  basis: "SETTLED_AMOUNT" | "SETTLED_WEIGHT";
  rate: string;
  cycle: "MONTHLY" | "QUARTERLY" | "YEARLY";
  payment_term_days: number;
  minimum_amount: string;
  maximum_amount: string | null;
  effective_from: string;
  effective_to: string | null;
  source: "COMPANY" | "PLATFORM_DEFAULT";
}

export interface RecyclerSettings {
  id: string;
  company: string;
  system_notifications: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
  deduction_confirmation_kg: string;
  ai_cctv_enabled: boolean;
  anpr_enabled: boolean;
  commission: RecyclerCommissionSetting | null;
  ai_cctv_device_count: number;
  anpr_device_count: number;
  created_at: string;
  updated_at: string;
}

export type TaskPositionEvent =
  | "POSITION"
  | "ARRIVAL"
  | "GEOFENCE_ENTER"
  | "GEOFENCE_EXIT"
  | "NAVIGATION_START"
  | "NAVIGATION_RETURN";

export interface DriverTaskPosition {
  id: string;
  task: string;
  recorded_by: string;
  client_event_id: string;
  event_type: TaskPositionEvent;
  latitude: string;
  longitude: string;
  accuracy_m: string | null;
  original_occurred_at: string;
  uploaded_at: string;
  distance_to_project_m: string | null;
  geofence_result: "INSIDE" | "OUTSIDE" | "NOT_EVALUATED";
  is_stale?: boolean;
  created_at: string;
}

export interface DriverTaskLivePosition extends DriverTaskPosition {
  task_no: string;
  driver_name: string;
  vehicle_plate: string;
  project_name: string | null;
  project_latitude: string | null;
  project_longitude: string | null;
  project_geofence_radius_m: number | null;
  is_stale: boolean;
}

export interface DriverLiveRoute {
  task: string;
  positions: DriverTaskPosition[];
}

export interface DriverLiveRoutes {
  routes: DriverLiveRoute[];
}

export interface DriverTaskPayload {
  dispatch?: string | null;
  site: string;
  vehicle: string;
  driver: string;
  scheduled_for?: string | null;
  notes?: string;
}

export type WeighDirection = "GROSS" | "TARE";

export type CommandState =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "REJECTED"
  | "TIMED_OUT"
  | "CLOSED_MANUALLY";

/** One instruction sent to a controller at the barrier, and what came back. */
export interface ReleaseCommand {
  id: string;
  kind: "GATE_OPEN" | "GATE_CLOSE" | "LED_MESSAGE" | "VOICE_ANNOUNCEMENT" | "OTHER";
  device_id: string;
  device_type: string;
  state: CommandState;
  detail: string;
  /** The only field that means the controller confirmed it acted. */
  acted: boolean;
  is_open: boolean;
  issued_at: string;
  expires_at: string;
  delivered_at: string | null;
  settled_at: string | null;
  text: string;
}

/**
 * What the yard's LED board, voice unit and barrier were told, and answered.
 *
 * `gate_open` is the field to read for anything that matters, and it is false
 * in three different situations that must not be collapsed: a command still in
 * flight, a controller that went quiet, and a yard with no barrier registered
 * at all. The platform says a barrier opened only when a barrier said so.
 */
export interface GateRelease {
  gate_open: boolean;
  barrier_configured: boolean;
  waiting: boolean;
  needs_operator: boolean;
  released_manually: boolean;
  manual_release_by_name: string;
  commands: ReleaseCommand[];
}

/** What a weighbridge is currently expecting to weigh. */
export interface GateBinding {
  id: string;
  scale: string;
  scale_code: string;
  dispatch: string;
  dispatch_no: string;
  waste_type: string;
  contractor_name: string;
  direction: WeighDirection;
  expected_plate: string;
  scanned_by_name: string;
  expires_at: string;
  is_live: boolean;
  consumed_at: string | null;
  session: string | null;
  created_at: string;
  released_manually_at: string | null;
  manual_release_reason: string;
  release: GateRelease;
}

export interface ScanDispatchPayload {
  scale: string;
  dispatch_no: string;
  direction?: WeighDirection;
  vehicle_plate?: string;
  scanned_by_name?: string;
  expires_in_minutes?: number;
}

export type DeductionKind =
  | "MOISTURE"
  | "CONTAMINATION"
  | "WRONG_MATERIAL"
  | "OVERSIZE"
  | "OTHER";

export const DEDUCTION_KINDS: DeductionKind[] = [
  "MOISTURE",
  "CONTAMINATION",
  "WRONG_MATERIAL",
  "OVERSIZE",
  "OTHER",
];

export type DeductionState =
  | "AUTO_ACCEPTED"
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "RECHECK";

export const DEDUCTION_STATES: DeductionState[] = [
  "PENDING",
  "AUTO_ACCEPTED",
  "ACCEPTED",
  "REJECTED",
  "RECHECK",
];

export interface DeductionPhoto {
  id: string;
  image: string;
  watermarked?: string | null;
  caption: string;
  taken_at: string | null;
  created_at: string;
}

export interface Deduction {
  id: string;
  dispatch: string;
  dispatch_no: string;
  project_name: string;
  recycler_name: string;
  site: string;
  site_name: string;
  kind: DeductionKind;
  weight_kg: string;
  reason: string;
  state: DeductionState;
  /** Whether it was over the threshold and had to be put to the producer. */
  needs_approval: boolean;
  /** Whether it counts against the settled weight. */
  is_counted: boolean;
  /** Whether the producer can still answer. */
  is_open: boolean;
  approval_threshold_kg: string;
  inspected_by_name: string;
  inspected_at: string;
  responded_at: string | null;
  responded_by: string | null;
  response_note: string;
  photos: DeductionPhoto[];
  created_at: string;
}

export interface DeductionPayload {
  dispatch: string;
  site: string;
  kind: DeductionKind;
  weight_kg: string;
  reason: string;
  inspected_by_name: string;
}

export type DeductionDecision = "ACCEPT" | "REJECT" | "RECHECK";

export type SettlementState = "DRAFT" | "ISSUED" | "LOCKED";

export const SETTLEMENT_STATES: SettlementState[] = [
  "DRAFT",
  "ISSUED",
  "LOCKED",
];

export interface TransactionCurrencySummary {
  currency: string;
  transactions: number;
  net_weight_kg: string | null;
  deduction_weight_kg: string | null;
  settled_weight_kg: string | null;
  total_amount: string | null;
  amount_paid: string | null;
  outstanding: string | null;
}

export interface TransactionStateSummary {
  state: SettlementState;
  currency: string;
  transactions: number;
  settled_weight_kg: string | null;
  total_amount: string | null;
}

export interface TransactionWasteTypeSummary {
  waste_type: string;
  currency: string;
  transactions: number;
  settled_weight_kg: string | null;
  total_amount: string | null;
}

export interface TransactionReport {
  total_transactions: number;
  by_currency: TransactionCurrencySummary[];
  by_state: TransactionStateSummary[];
  by_waste_type: TransactionWasteTypeSummary[];
}

export type PaymentMethod =
  | "BANK_TRANSFER"
  | "CHEQUE"
  | "CASH"
  | "OFFSET"
  | "OTHER";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "BANK_TRANSFER",
  "CHEQUE",
  "CASH",
  "OFFSET",
  "OTHER",
];

export interface PaymentProof {
  id: string;
  settlement: string;
  amount: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string;
  document: string | null;
  notes: string;
  created_at: string;
}

export interface Settlement {
  id: string;
  settlement_no: string;
  state: SettlementState;
  is_locked: boolean;
  is_editable: boolean;
  dispatch: string;
  dispatch_no: string;
  waste_type: string;
  project_name: string;
  contractor_name: string;
  recycler_name: string;
  session: string | null;
  session_no: string | null;
  /** All three frozen at issue. A settlement is a statement about one day. */
  net_weight_kg: string;
  deduction_weight_kg: string;
  settled_weight_kg: string;
  unit_price: string | null;
  total_amount: string | null;
  currency: string;
  amount_paid: string;
  outstanding: string | null;
  issued_at: string | null;
  locked_at: string | null;
  notes: string;
  payments: PaymentProof[];
  created_at: string;
}

/** What a load would settle at, before anyone commits to it. */
export interface SettlementQuote {
  dispatch: string;
  dispatch_no: string;
  session_no: string | null;
  net_weight_kg: string | null;
  deduction_weight_kg: string;
  settled_weight_kg: string | null;
  open_deductions: number;
  unit_price: string | null;
  total_amount: string | null;
}
