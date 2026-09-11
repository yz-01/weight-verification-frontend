/** The contractor console's records: sites, suppliers, deliveries and loads out. */

export type ProjectStatus =
  | "PLANNING"
  | "ACTIVE"
  | "SUSPENDED"
  | "COMPLETED"
  | "ARCHIVED";

export interface Project {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  description?: string;
  client_name: string;
  main_contractor?: string;
  consultant?: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  latitude?: string | null;
  longitude?: string | null;
  geofence_radius_m: number | null;
  has_coordinates?: boolean;
  has_geofence?: boolean;
  start_date: string | null;
  end_date: string | null;
  site_manager: string;
  site_phone?: string;
  assigned_user_count?: number;
  created_at: string;
}

export interface ProjectPayload {
  code: string;
  name: string;
  status: ProjectStatus;
  description?: string;
  client_name?: string;
  main_contractor?: string;
  consultant?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  latitude?: string | null;
  longitude?: string | null;
  geofence_radius_m?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  site_manager?: string;
  site_phone?: string;
}

export type ProjectStatisticsPeriod = "day" | "month" | "year" | "all";

export interface ProjectStatistics {
  project: string;
  period: ProjectStatisticsPeriod;
  date: string;
  start: string | null;
  end: string | null;
  total_records: number;
  totals: {
    material_receipts: number;
    equipment_movements: number;
    progress_records: number;
    safety_incidents: number;
    attendance_events: number;
    waste_dispatches: number;
    consultant_applications: number;
    field_tasks: number;
    photos: number;
    documents: number;
  };
}

export interface ProjectAssignment {
  id: string;
  user: string;
  user_name: string;
  user_email: string;
  role_code: string;
  role_name: string;
  is_field_staff: boolean;
  project: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  address_line_1?: string;
  city: string;
  state?: string;
  registration_no?: string;
  is_active: boolean;
  qr_token?: string;
  qr_is_active?: boolean;
  qr_issued_at?: string;
  qr_code_count?: number;
  created_at: string;
}

export interface SupplierPayload {
  code: string;
  name: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  address_line_1?: string;
  city?: string;
  state?: string;
  registration_no?: string;
  is_active?: boolean;
}

export interface SupplierQRCode {
  id: string;
  token: string;
  project: string;
  project_code: string;
  project_name: string;
  supplier: string;
  supplier_code: string;
  supplier_name: string;
  is_active: boolean;
  revoked_at: string | null;
  created_at: string;
}

export type DeliveryNoteStatus =
  | "ISSUED"
  | "ARRIVED"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "VOIDED";

export type DeliveryNoteDecision = "RECEIVED" | "REJECTED";
export type DeliveryNoteEvidenceKind = "VEHICLE" | "UNLOADING" | "DELIVERY_NOTE" | "OTHER";

export interface DeliveryNoteEvidence {
  id: string;
  kind: DeliveryNoteEvidenceKind;
  image: string;
  watermarked?: string | null;
  caption: string;
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
}

export interface DeliveryNote {
  id: string;
  note_no: string;
  project: string;
  project_code: string;
  project_name: string;
  supplier: string;
  supplier_code: string;
  supplier_name: string;
  qr_code: string | null;
  qr_serial: string | null;
  qr_token: string | null;
  qr_url: string | null;
  status: DeliveryNoteStatus;
  decision: DeliveryNoteDecision | "";
  vehicle_plate: string;
  driver_name: string;
  material_name: string;
  expected_quantity: string;
  actual_quantity: string | null;
  unit: MaterialUnit;
  expected_delivery_at: string;
  notes: string;
  issued_at: string;
  arrived_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  voided_at: string | null;
  receiver_name: string;
  receiver_signature: string | null;
  rejection_reason: string;
  completion_note: string;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  receipt_id: string | null;
  receipt_no: string | null;
  /** The material column the receipt files under once this note is signed. */
  category: string | null;
  category_code: string | null;
  category_name: string | null;
  /**
   * What the site changed the quantity from, and who changed it.
   *
   * Present only when the site actually amended the figure. An untouched
   * delivery leaves these empty on purpose, so the flag keeps its meaning on
   * the deliveries where somebody did override the docket.
   */
  quantity_amended_from: string | null;
  quantity_amended_by_name: string;
  quantity_amended_at: string | null;
  quantity_was_amended: boolean;
  evidence: DeliveryNoteEvidence[];
  created_at: string;
  updated_at: string;
}

export interface DeliveryNotePublic {
  note_no: string;
  company_name: string;
  project_name: string;
  supplier_name: string;
  status: DeliveryNoteStatus;
  decision: DeliveryNoteDecision | "";
  vehicle_plate: string;
  driver_name: string;
  material_name: string;
  expected_quantity: string;
  actual_quantity: string | null;
  unit: MaterialUnit;
  expected_delivery_at: string;
  notes: string;
  arrived_at: string | null;
  completed_at: string | null;
  receiver_name: string;
  rejection_reason: string;
  completion_note: string;
  category_name: string | null;
  quantity_amended_from: string | null;
  quantity_was_amended: boolean;
  evidence: DeliveryNoteEvidence[];
}

export type MaterialUnit = "TONNE" | "KG" | "M3" | "PIECE" | "LOAD" | "BAG";

export const MATERIAL_UNITS: MaterialUnit[] = [
  "TONNE",
  "KG",
  "M3",
  "PIECE",
  "LOAD",
  "BAG",
];

export type PhotoKind = "DELIVERY_NOTE" | "VEHICLE" | "UNLOADING" | "OTHER";

export interface ReceiptPhoto {
  id: string;
  kind: PhotoKind;
  image: string;
  watermarked?: string | null;
  caption: string;
  latitude: string | null;
  longitude: string | null;
  taken_at: string | null;
  uploaded_at?: string;
  device_id?: string;
  /**
   * Who put this photograph on the record (T-243).
   *
   * Per photograph and not per receipt: the gate shots come from a phone on
   * site, the delivery order is often scanned in the office afterwards by
   * somebody else, and a dispute asks which.
   */
  created_by_name?: string | null;
  created_at: string;
}

export interface MaterialReceipt {
  id: string;
  receipt_no: string;
  project: string;
  project_code: string;
  project_name: string;
  supplier: string;
  supplier_name: string;
  movement_type: "ENTRY" | "RETURN";
  return_reason: string;
  /** Which material column this delivery is filed in; null when unfiled. */
  category: string | null;
  category_code: string | null;
  category_name: string | null;
  material_name: string;
  material_specification: string;
  quantity: string;
  unit: MaterialUnit;
  total_weight_kg: string | null;
  unit_price: string | null;
  total_value: string | null;
  vehicle_plate: string;
  received_by_name: string;
  /** Stamped by the platform, never by the device that filed the receipt. */
  captured_at: string;
  has_location: boolean;
  /**
   * Whether *the person asking* has read this delivery.
   *
   * Answered per request, never stored on the row: head office and the
   * project manager wait on the same arrival and clear it separately, so a
   * shared flag would let whoever opened it first close it for both.
   */
  is_seen: boolean;
  photo_count?: number;
}

/**
 * Whether the delivery has been looked at and signed off.
 *
 * Deliberately separate from money: a rejected delivery is flagged loudly and
 * counted on the home page, but nothing here touches `document_amount` or the
 * payment state. An action that changes what is owed is one a person presses
 * on purpose, not a side effect of a quality call somebody might revise (U-028).
 */
/**
 * One row of "what I submitted", normalised across five different records.
 *
 * `status_label` travels beside `status` on purpose: the catalogue translates
 * the code, but a code with no entry would reach the screen raw - which is the
 * defect the customer reported as `PENDING_APPROVAL` in front of them (F-225).
 */
export interface MySubmissionRow {
  id: string;
  kind:
    | "MATERIAL_RECEIPT"
    | "SITE_RECORD"
    | "WASTE_OUTGOING"
    | "HAZARD"
    | "PROGRESS"
    | "DRIVER_TRIP";
  reference: string;
  detail: string;
  project_id: string | null;
  project_name: string;
  submitted_at: string;
  status: string;
  status_label: string;
  photo: string | null;
}

/**
 * One labelled row of a submission's detail.
 *
 * `key` is a machine key the phone translates through
 * `mySubmissions.field.<key>`; the server never sends words. `unit` is a code
 * for the same reason, translated through `mySubmissions.unit.<code>` - one
 * catalogue for both modules, because a receipt's units have labels on the
 * Django model and a waste record's do not, and sending one English label
 * beside one raw code is how `PENDING_APPROVAL` reached a customer's screen
 * (F-225). `core.tests.test_submission_labels` checks both vocabularies
 * against all four catalogues.
 */
export interface MySubmissionField {
  key: string;
  value: string;
  unit?: string;
}

export interface MySubmissionPhoto {
  /**
   * The photograph's own primary key.
   *
   * Added for Multi Engine, which lets a person tick some of a record's
   * photographs and not others (D-149); ticking by position would point
   * somewhere else the moment one is added to the source (D-152). Optional
   * because the two older screens neither send nor read it.
   */
  id?: string;
  url: string;
  caption: string;
}

/** A history row, opened. */
export interface MySubmissionDetail extends MySubmissionRow {
  fields: MySubmissionField[];
  /** Empty rather than absent when a record carries none. */
  photos: MySubmissionPhoto[];
}

export interface MySubmissionsPage {
  results: MySubmissionRow[];
  count: number;
  /** True when the page shows fewer rows than exist, so the screen can say so. */
  truncated: boolean;
}

export type MaterialAcceptance = "PENDING" | "ACCEPTED" | "REJECTED";

export interface MaterialReceiptDetail extends MaterialReceipt {
  qr_code: string | null;
  acceptance_status?: MaterialAcceptance;
  accepted_by_name?: string | null;
  accepted_at?: string | null;
  rejection_reason?: string;
  /**
   * The receipt this one corrects, when it is a correction.
   *
   * Carried through to the screen because a corrected figure with nothing
   * saying what it replaced, and why, is the part of the trail a dispute
   * actually asks for.
   */
  supersedes?: string | null;
  correction_reason?: string;
  /**
   * The correction that replaced this receipt, when one exists.
   *
   * A superseded receipt stays readable by id but leaves the list and the
   * totals, so an old link would otherwise open a receipt that looks entirely
   * current while its figures have been corrected away.
   */
  superseded_by?: { id: string; receipt_no: string } | null;
  delivery_note_no: string;
  notes: string;
  signature: string | null;
  supplier_signature: string | null;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  ocr_status: "NOT_REQUESTED" | "SUCCEEDED" | "NOT_CONFIGURED" | "FAILED" | "MANUAL";
  ocr_result: DeliveryNoteOCRResult | Record<string, unknown>;
  photos: ReceiptPhoto[];
  created_by: string | null;
  created_by_name: string | null;
  created_by_phone: string;
  created_by_avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialReceiptPayload {
  project: string;
  supplier: string;
  qr_code?: string | null;
  movement_type?: "ENTRY" | "RETURN";
  return_reason?: string;
  material_name: string;
  material_specification?: string;
  quantity: string;
  unit: MaterialUnit;
  total_weight_kg?: string | null;
  /**
   * The material column this delivery files under.
   *
   * Optional because a site with no column set up still has to be able to
   * receive material - an unfiled receipt can be filed later. The field app
   * never sent it at all until T-161, so every delivery taken on site arrived
   * unfiled no matter how many columns the project had.
   */
  category?: string | null;
  unit_price?: string | null;
  vehicle_plate?: string;
  delivery_note_no?: string;
  notes?: string;
  received_by_name: string;
  original_captured_at?: string;
  client_event_id?: string;
  field_task?: string;
  latitude?: string | null;
  longitude?: string | null;
  location_accuracy_m?: string | null;
  ocr_proof?: string;
}

export type DeliveryNoteOCRField =
  | "delivery_note_no"
  | "vehicle_plate"
  | "supplier_name"
  | "material_name"
  | "quantity";

export interface DeliveryNoteOCRLineItem {
  /** The note's own Marks/No. code for the row (e.g. RB-10), when printed. */
  code?: string;
  material_name: string;
  quantity: string;
  unit: string;
  /**
   * The material column the reader matched this line to, if any.
   *
   * The id is here so an unclassified line can be turned into a column and a
   * classified one selected without a second lookup. Only material columns
   * are ever offered - a site-record column is not somewhere a delivery can
   * be filed.
   */
  category_id: string | null;
  category_code: string;
  category_name: string;
  classified: boolean;
}

export interface DeliveryNoteOCRResult {
  status: "SUCCEEDED";
  provider: string;
  content: string;
  suggestions: Partial<Record<DeliveryNoteOCRField, string>>;
  confidence: Partial<Record<DeliveryNoteOCRField, number>>;
  low_confidence_fields: DeliveryNoteOCRField[];
  confidence_threshold: number;
  line_items: DeliveryNoteOCRLineItem[];
  proof: string;
}

export interface ReceiptSummary {
  total_receipts: number;
  total_cost: string | null;
  priced_receipts: number;
  unpriced_receipts: number;
  by_unit: Array<{ unit: MaterialUnit; quantity: string; receipts: number }>;
  by_material: Array<{
    material_name: string;
    unit: MaterialUnit;
    quantity: string;
    receipts: number;
    total_cost: string | null;
    unpriced_receipts: number;
  }>;
  by_supplier: Array<{
    supplier: string;
    supplier_name: string;
    receipts: number;
    total_cost: string | null;
    unpriced_receipts: number;
  }>;
}

export type WasteType =
  | "MIXED"
  | "CONCRETE"
  | "METAL"
  | "TIMBER"
  | "PLASTIC"
  | "PAPER"
  | "SOIL"
  | "HAZARDOUS"
  | "OTHER";

export const WASTE_TYPES: WasteType[] = [
  "MIXED",
  "CONCRETE",
  "METAL",
  "TIMBER",
  "PLASTIC",
  "PAPER",
  "SOIL",
  "HAZARDOUS",
  "OTHER",
];

export type DispatchState =
  | "DRAFT"
  | "PENDING_ACCEPTANCE"
  | "ACCEPTED"
  | "RELEASED"
  | "COLLECTED"
  | "WEIGHED"
  | "SETTLED"
  | "CANCELLED";

export const DISPATCH_STATES: DispatchState[] = [
  "DRAFT",
  "PENDING_ACCEPTANCE",
  "ACCEPTED",
  "RELEASED",
  "COLLECTED",
  "WEIGHED",
  "SETTLED",
  "CANCELLED",
];

/** What a dispatch photograph is evidence of. */
export type DispatchPhotoKind = "LOADING" | "VEHICLE" | "PLATE" | "OTHER";

export interface DispatchPhoto {
  id: string;
  kind: "LOADING" | "VEHICLE" | "PLATE" | "OTHER";
  image: string;
  watermarked?: string | null;
  caption: string;
  latitude: string | null;
  longitude: string | null;
  taken_at: string | null;
  created_at: string;
}

export interface WasteDispatchEvent {
  id: string;
  event_type: string;
  event_label: string;
  actor: string | null;
  actor_name: string | null;
  actor_company: string | null;
  actor_company_name: string | null;
  from_state: string;
  to_state: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  created_at: string;
}

export interface WasteDispatch {
  id: string;
  dispatch_no: string;
  contractor_name: string;
  project: string;
  project_code: string;
  project_name: string;
  recycler: string;
  recycler_name: string;
  waste_type: WasteType;
  estimated_weight_kg: string | null;
  /**
   * Where the lorry collects from. Served since T-138 and never read on this
   * side until T-227, which is how the recycler ended up with an order book
   * that did not say where to drive.
   *
   * Never blank for a project that has an address: the server falls back to
   * the project's postal line. `pickup_address_source` is the half that
   * decides whether a person chose this address or it was inherited - an
   * empty string on orders raised before the column existed.
   */
  pickup_address: string;
  pickup_address_source: "MANUAL" | "PROJECT" | "";
  vehicle_plate: string;
  driver_name: string;
  state: DispatchState;
  accepted_at: string | null;
  proposed_collection_at: string | null;
  proposed_collection_note: string;
  confirmed_collection_at: string | null;
  confirmed_collection_note: string;
  collection_plan_confirmed_at: string | null;
  collection_plan_confirmed_by: string | null;
  driver_assigned_at: string | null;
  released_at: string | null;
  /** Only a draft is editable; after release the record is evidence. */
  is_editable: boolean;
  has_location: boolean;
  photo_count?: number;
}

export interface WasteDispatchDetail extends WasteDispatch {
  source_record_id: string | null;
  source_reference_no: string | null;
  source_record: import("@/interfaces/waste-outgoing").WasteOutgoingRecord | null;
  description: string;
  driver_phone: string;
  driver_ic: string;
  released_by_name: string;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  photos: DispatchPhoto[];
  events: WasteDispatchEvent[];
  weighing: import("@/interfaces/waste-outgoing").WasteWeighing | null;
  tasks: import("@/interfaces/waste-outgoing").WasteCollectionTask[];
  settlement: import("@/interfaces/waste-outgoing").WasteSettlementSummary | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WasteDispatchPayload {
  project: string;
  recycler: string;
  waste_type: WasteType;
  estimated_weight_kg?: string | null;
  description?: string;
  /** Blank means "use the project address", not "store an empty line". */
  pickup_address?: string;
  vehicle_plate: string;
  driver_name?: string;
  driver_phone?: string;
  driver_ic?: string;
  latitude?: string | null;
  longitude?: string | null;
  location_accuracy_m?: string | null;
}

/** A recycler a load may be sent to. Deliberately thin: this is cross-tenant. */
export interface RecyclerOption {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
}

export interface DispatchSummary {
  total_dispatches: number;
  today_orders: number;
  month_orders: number;
  completed_orders: number;
  recycling_orders: number;
  cancelled_orders: number;
  by_type: Array<{
    waste_type: WasteType;
    dispatches: number;
    estimated_weight_kg: string | null;
  }>;
  by_state: Partial<Record<DispatchState, number>>;
}
