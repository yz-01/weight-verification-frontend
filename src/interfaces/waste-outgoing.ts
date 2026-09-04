/** Waste leaving site, and the recycling loop it opens (requirement 8). */

/** Units requirement 8.2.8 lists. `PIECE` is the code for the customer's "Unit". */
export type WasteUnit = "TONNE" | "KG" | "M3" | "BAG" | "PIECE" | "OTHER";

export const WASTE_UNITS: WasteUnit[] = [
  "TONNE",
  "KG",
  "M3",
  "BAG",
  "PIECE",
  "OTHER",
];

/**
 * Where a waste-out record is in its life.
 *
 * A field submission is approved before the office can send a recycle order.
 */
export type WasteOutgoingStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "RETURNED"
  | "APPROVED"
  | "ORDERED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface WasteCategory {
  id: string;
  code: string;
  name: string;
  /** Which `waste.WasteType` a dispatch raised from this category declares. */
  dispatch_type: string;
  description: string;
  sort_order: number;
  /** One of the seven the customer named: deactivate rather than delete. */
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WasteOutgoingPhoto {
  id: string;
  image: string;
  /** The 8.2.6 derivative. Blank when the renderer was unavailable. */
  watermarked: string;
  caption: string;
  captured_at: string | null;
  latitude: string | null;
  longitude: string | null;
  device_id: string;
  client_event_id: string;
  created_at: string;
}

export interface WasteOutgoingRecord {
  id: string;
  reference_no: string;
  project: string;
  project_name: string;
  category: string;
  category_name: string;
  category_code: string;
  quantity: string | null;
  unit: string;
  note: string;
  status: WasteOutgoingStatus;
  captured_at: string | null;
  latitude: string | null;
  longitude: string | null;
  device_id: string;
  client_event_id: string;
  submitted_at: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  site_contact_name: string;
  site_contact_phone: string;
  /**
   * Where the lorry is sent. `pickup_address_source` is the half that matters
   * afterwards: a wrong typed address and a wrong project address read the
   * same, and they are two different conversations.
   */
  pickup_address: string;
  pickup_address_source: "MANUAL" | "PROJECT" | "";
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_note: string;
  /**
   * The handover trail. `delegated_to` is null while the application is still
   * head office's to decide, which is the normal state: head office reads
   * every one and passes on the ones it chooses to, one at a time.
   */
  delegated_to: string | null;
  delegated_to_name: string | null;
  delegated_by: string | null;
  delegated_by_name: string | null;
  delegated_at: string | null;
  delegation_note: string;
  recycler: string | null;
  recycler_name: string | null;
  dispatch: string | null;
  dispatch_no: string | null;
  dispatch_state: string | null;
  proposed_collection_at: string | null;
  proposed_collection_note: string;
  confirmed_collection_at: string | null;
  confirmed_collection_note: string;
  collection_plan_confirmed_at: string | null;
  ordered_at: string | null;
  ordered_by: string | null;
  ordered_by_name: string | null;
  completed_at: string | null;
  cancel_reason: string;
  recorded_by_name: string | null;
  photos: WasteOutgoingPhoto[];
  created_at: string;
  updated_at: string;
}

/** The twelve stages of 8.2.12, in the order the customer lists them. */
export type MilestoneKey =
  | "ORDER_SENT"
  | "RECYCLER_ACCEPTED"
  | "DRIVER_ASSIGNED"
  | "DRIVER_EN_ROUTE"
  | "DRIVER_ARRIVED"
  | "LOADED"
  | "LEFT_SITE"
  | "ARRIVED_AT_PLANT"
  | "WEIGHED"
  | "COMPLETED"
  | "SETTLED";

export interface TrackingMilestone {
  key: MilestoneKey;
  at: string | null;
  done: boolean;
}

/**
 * 8.2.13 read-back.
 *
 * There is no first/second weight pair stored on one row: each weighbridge pass
 * is its own session. At a stored-tare yard the second pass does not exist at
 * all and the server derives it, which is why `second_weight_kg` can be null on
 * a load that is fully weighed.
 */
export interface WasteWeighing {
  session_id: string;
  session_no: string;
  first_weight_kg: string | null;
  second_weight_kg: string | null;
  net_weight_kg: string | null;
  state: string;
  verdict: string;
  requires_review: boolean;
  anomalies: string[];
  weighed_at: string | null;
}

export interface WasteTaskPhoto {
  id: string;
  kind: string;
  image: string;
  caption: string;
  latitude: string | null;
  longitude: string | null;
  taken_at: string | null;
}

export interface WasteDriverPosition {
  id: string;
  event_type: string;
  latitude: string;
  longitude: string;
  accuracy_m: string | null;
  occurred_at: string;
  uploaded_at: string;
  geofence_result: "INSIDE" | "OUTSIDE" | "NOT_EVALUATED";
}

export interface WasteCollectionTask {
  id: string;
  task_no: string;
  state: string;
  driver_name: string;
  vehicle_plate: string;
  scheduled_for: string | null;
  latest_position: WasteDriverPosition | null;
  route: WasteDriverPosition[];
  photos: WasteTaskPhoto[];
}

export interface WasteSettlementSummary {
  id?: string;
  settlement_no?: string;
  state?: string;
  net_weight_kg: string | null;
  deduction_weight_kg: string | null;
  settled_weight_kg: string | null;
  unit_price: string | null;
  total_amount: string | null;
  currency: string;
  issued_at: string | null;
  amount_paid: string;
  outstanding: string | null;
  deductions: Array<{
    id: string;
    kind: string;
    weight_kg: string;
    reason: string;
    state: string;
    inspected_by_name: string;
    inspected_at: string;
    responded_at: string | null;
    response_note: string;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    paid_on: string;
    method: string;
    reference: string;
    notes: string;
  }>;
}

export interface WasteTracking {
  record: WasteOutgoingRecord;
  ordered: boolean;
  dispatch_no?: string;
  dispatch_state?: string;
  recycler?: string;
  driver_name?: string;
  vehicle_plate?: string;
  milestones: TrackingMilestone[];
  weighing: WasteWeighing | null;
  tasks?: WasteCollectionTask[];
  settlement?: WasteSettlementSummary | null;
  /**
   * Present only before an order exists. Carries the reason there is nothing to
   * track, rather than showing an empty timeline that would read as "nothing has
   * happened yet" when in fact no order was ever raised.
   */
  unavailable?: Record<string, string>;
}

export interface WasteOutgoingOptions {
  categories: WasteCategory[];
  units: string[];
  dispatch_types: string[];
}

export interface WasteQuantityTotals {
  records: number;
  /** Summed per unit: tonnes and bags are not addable, so they are not added. */
  quantity_by_unit: Record<string, string>;
}

export interface WasteOutgoingTotals {
  today: WasteQuantityTotals;
  month: WasteQuantityTotals;
  year: WasteQuantityTotals;
  all_time: WasteQuantityTotals;
  by_project: Array<{ project: string; records: number }>;
  by_category: Array<{ category: string; code: string; records: number }>;
  by_status: Record<string, number>;
}

export interface RecyclerOption {
  id: string;
  name: string;
  code: string;
}
