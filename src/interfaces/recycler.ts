/** The recycler console's records: fleet, trips, the gate, and the money. */

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

export interface Vehicle {
  id: string;
  plate_no: string;
  vehicle_type: VehicleType;
  make_model: string;
  /** Only used by yards weighing against a stored tare. Set via its own action. */
  tare_weight_kg: string | null;
  tare_measured_at: string | null;
  has_stored_tare: boolean;
  max_laden_kg: string | null;
  road_tax_expires_on: string | null;
  permit_expires_on: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
}

export interface VehiclePayload {
  plate_no: string;
  vehicle_type: VehicleType;
  make_model?: string;
  max_laden_kg?: string | null;
  road_tax_expires_on?: string | null;
  permit_expires_on?: string | null;
  notes?: string;
  is_active?: boolean;
}

export interface Driver {
  id: string;
  full_name: string;
  phone: string;
  ic_no: string;
  licence_no: string;
  licence_expires_on: string | null;
  default_vehicle: string | null;
  default_vehicle_plate: string | null;
  user: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DriverPayload {
  full_name: string;
  phone: string;
  ic_no?: string;
  licence_no?: string;
  licence_expires_on?: string | null;
  default_vehicle?: string | null;
  is_active?: boolean;
}

export type TaskState =
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "LOADED"
  | "RETURNING"
  | "DELIVERED"
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
  CANCELLED: [],
  FAILED: [],
};

export interface TaskPhoto {
  id: string;
  kind: "ARRIVAL" | "LOADING" | "LOADED" | "PLATE" | "ISSUE" | "OTHER";
  image: string;
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
  recorded_by: string;
  recorded_by_name: string;
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
  photo_count?: number;
}

export interface DriverTaskDetail extends DriverTask {
  project_name: string | null;
  project_address_line_1: string;
  project_address_line_2: string;
  project_city: string;
  project_state: string;
  project_postcode: string;
  project_latitude: string | null;
  project_longitude: string | null;
  project_geofence_radius_m: number | null;
  contractor_name: string | null;
  accepted_at: string | null;
  arrived_at: string | null;
  loaded_at: string | null;
  arrival_latitude: string | null;
  arrival_longitude: string | null;
  notes: string;
  failure_reason: string;
  photos: TaskPhoto[];
  transitions: DriverTaskTransition[];
  created_at: string;
  updated_at: string;
}

export type TaskPositionEvent =
  | "POSITION"
  | "ARRIVAL"
  | "GEOFENCE_ENTER"
  | "GEOFENCE_EXIT";

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
