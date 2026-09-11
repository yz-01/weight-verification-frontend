/**
 * Which of the two filing schemes a column belongs to.
 *
 * The site-record columns and the material columns are different things and
 * hold different photographs (user, 2026-09-05). One tree served both, so the
 * material screen listed every column in the project including the ones that
 * only ever hold site photographs.
 *
 * `BOTH` is not a third scheme - it is the marker on a column nobody has
 * classified yet, either because it already holds both kinds of evidence or
 * because it holds none. Such a column keeps appearing on both screens, which
 * is where it already was, rather than vanishing from both.
 */
/**
 * The module a column is filed under, plus the two original filing schemes.
 *
 * `PROGRESS`, `EHS`, `RECYCLE` and `CONSTRUCTION_WASTE` are the modules the
 * customer named for Category Management (2026-09-11, D-125): materials must
 * not share a level with documents, while one screen still manages them all.
 *
 * Four of the seven modules the customer listed are absent on purpose, because
 * their vocabularies already exist on the server with different scopes and
 * real records pointing at them through protected keys: documents
 * (`DocumentCategory`, per company), equipment (`AssetCategoryDefinition`, per
 * platform), recyclable waste (`WasteCategory`, per company, seven seeded rows)
 * and the weighted construction stages (`ConstructionPhase`, per project).
 * Defining any of them again here would be two sources of truth for one thing
 * (F-333, F-338, D-126).
 */
export type ProjectCategoryKind =
  | "FIELD"
  | "MATERIAL"
  | "BOTH"
  | "PROGRESS"
  | "EHS"
  | "CONSTRUCTION_WASTE";
export type CategorySubmissionMode = "DIRECT" | "REVIEW" | "CONSULTANT";

export interface ProjectCategory {
  id: string;
  project: string;
  parent: string | null;
  parent_name: string | null;
  code: string;
  name: string;
  kind: ProjectCategoryKind;
  submission_mode: CategorySubmissionMode;
  description: string;
  sort_order: number;
  /** Whether spending filed here counts against a budget; the owner's switch. */
  tracks_spend: boolean;
  /** Money, not weight - the amount comes off the supplier's delivery order. */
  budget_amount: string | null;
  budget_alert_percentages: number[];
  /**
   * Records filed under this category, from the relation that matches its
   * module - the count the category management screen shows (D-125).
   */
  record_count: number;
  spend_amount: string;
  /**
   * Deliveries whose amount could not be read off the paperwork.
   *
   * Surfaced rather than swallowed: a total that quietly skipped them reads
   * as under budget precisely when the documents were unreadable.
   */
  spend_uncounted_deliveries: number;
  budget_used_percent: number | null;
  /** Shown because it was asked for; never used to decide an alert. */
  tonnes_received: string;
  tonnes_excluded_deliveries: number;
  /**
   * How many of this column's deliveries *the person asking* still owes a
   * look, and how many they have filed away. Per reader, never shared: head
   * office reading one must not empty the project manager's pile.
   */
  pending_deliveries: number | null;
  archived_deliveries: number | null;
  is_visible_in_pwa: boolean;
  is_active: boolean;
  access_mode: "ALL" | "RESTRICTED";
  allowed_roles: string[];
  allowed_role_names: string[];
  allowed_users: string[];
  allowed_user_names: string[];
  upload_roles: string[];
  upload_role_names: string[];
  upload_users: string[];
  upload_user_names: string[];
  edit_roles: string[];
  edit_role_names: string[];
  edit_users: string[];
  edit_user_names: string[];
  can_upload: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectCategoryPayload {
  project: string;
  parent?: string | null;
  code: string;
  name: string;
  /**
   * Required when the whole record is written, not defaulted.
   *
   * The API asks for it on create for the same reason: a column created
   * without an answer would list on both screens, and the person creating it
   * is the one who knows which it is.
   */
  kind: ProjectCategoryKind;
  submission_mode?: CategorySubmissionMode;
  description?: string;
  sort_order?: number;
  /** Whether spending filed here counts against a budget; the owner's switch. */
  tracks_spend?: boolean;
  /** Money, not weight. Null for a column that counts nothing. */
  budget_amount?: string | null;
  /** The percentages of that budget worth interrupting the owner for. */
  budget_alert_percentages?: number[];
  is_visible_in_pwa?: boolean;
  is_active?: boolean;
  access_mode?: "ALL" | "RESTRICTED";
  allowed_roles?: string[];
  allowed_users?: string[];
  upload_roles?: string[];
  upload_users?: string[];
  edit_roles?: string[];
  edit_users?: string[];
}

export interface ProjectResponsibility {
  id: string;
  project: string;
  user: string;
  user_name: string;
  user_phone: string;
  responsibility: string;
  is_primary: boolean;
  can_confirm_progress: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type FieldTaskType =
  | "PHOTO"
  | "MATERIAL"
  | "EQUIPMENT"
  | "PROGRESS"
  | "SAFETY"
  | "WASTE"
  | "CONSULTANT"
  | "OTHER";
export type FieldTaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "ACCEPTED"
  | "RETURNED"
  | "CANCELLED";

export interface FieldTaskPhoto {
  id: string;
  image: string;
  watermarked?: string | null;
  caption: string;
  captured_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  device_id: string;
  client_event_id: string;
}

export interface FieldTaskReference {
  id: string;
  kind: "PHOTO" | "FILE";
  file: string;
  label: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface FieldTask {
  id: string;
  project: string;
  project_name: string;
  title: string;
  task_type: FieldTaskType;
  instructions: string;
  work_location: string;
  submission_category: string;
  assigned_to: string;
  assigned_to_name: string;
  created_by_name: string;
  category: string | null;
  category_name: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  due_at: string | null;
  status: FieldTaskStatus;
  evidence_required: number;
  started_at: string | null;
  start_latitude: string | null;
  start_longitude: string | null;
  start_accuracy_m: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string;
  client_event_id: string;
  linked_record_type: string;
  linked_record_id: string | null;
  linked_record_reference: string;
  linked_at: string | null;
  photos: FieldTaskPhoto[];
  references: FieldTaskReference[];
  photo_count: number;
  created_at: string;
  updated_at: string;
}

export interface FieldTaskPayload {
  project: string;
  title: string;
  task_type: FieldTaskType;
  instructions?: string;
  work_location?: string;
  submission_category?: string;
  assigned_to: string;
  category?: string | null;
  priority?: FieldTask["priority"];
  due_at?: string | null;
  evidence_required?: number;
  client_event_id?: string;
  references?: File[];
}

export type EquipmentStatus = "OFF_SITE" | "ON_SITE" | "MAINTENANCE" | "RETIRED";
export interface SiteEquipment {
  id: string;
  project: string;
  project_name: string;
  code: string;
  name: string;
  serial_no: string;
  registration_no: string;
  supplier: string | null;
  supplier_name: string | null;
  description: string;
  status: EquipmentStatus;
  /**
   * When the paperwork runs out. Both nullable, because a contractor may not
   * hold a certificate for every item on site - and a null must not read as
   * expired.
   */
  certificate_expires_on: string | null;
  insurance_expires_on: string | null;
  is_active: boolean;
  movement_count: number;
  quantity_on_site: string;
  created_at: string;
  updated_at: string;
}

export interface EquipmentPayload {
  project: string;
  code: string;
  name: string;
  serial_no?: string;
  registration_no?: string;
  supplier?: string | null;
  description?: string;
  /** ISO date, or null when the contractor does not hold the document. */
  certificate_expires_on?: string | null;
  insurance_expires_on?: string | null;
  is_active?: boolean;
}

export interface EquipmentMovement {
  id: string;
  project: string;
  project_name: string;
  equipment: string;
  equipment_code: string;
  equipment_name: string;
  direction: "ENTRY" | "EXIT";
  occurred_at: string;
  original_occurred_at: string;
  uploaded_at: string;
  quantity: string;
  unit: "UNIT" | "PIECE" | "SET" | "LOAD" | "TONNE" | "KG" | "M3" | "OTHER";
  supplier_name: string | null;
  delivery_note_no: string;
  vehicle_plate: string;
  operator_name: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  notes: string;
  ocr_status: string;
  ocr_result: Record<string, unknown>;
  ocr_confirmed_by: string | null;
  ocr_confirmed_at: string | null;
  client_event_id: string;
  photos: Array<{ id: string; image: string; watermarked?: string | null; kind: string; captured_at: string }>;
}

export interface EquipmentSummary {
  today: string;
  month: string;
  year: string;
  project_total: string;
  quantity_on_site: string;
  equipment_count: number;
  by_equipment: Array<{
    equipment: string;
    code: string;
    name: string;
    quantity_on_site: string;
  }>;
}

export interface ConstructionPhase {
  id: string;
  project: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  planned_weight: string;
  is_active: boolean;
  /** Progress records measured against this phase (D-125, D-127). */
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface SiteProgressRecord {
  id: string;
  project: string;
  project_name: string;
  phase: string;
  phase_name: string;
  percent_complete: string;
  /**
   * The progress column this record files under, or null while unfiled.
   *
   * Separate from the phase: the phase carries the weight the completion
   * percentage is computed against, the column is the customer'''s filing
   * dimension (D-127). Set by the office through `file_record`, never on
   * create - the site does not choose columns (D-108).
   */
  category: string | null;
  category_name: string | null;
  category_code: string | null;
  description: string;
  status: "SUBMITTED" | "CONFIRMED" | "RETURNED";
  captured_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  submitted_by_name: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  review_note: string;
  photos: Array<{ id: string; image: string; watermarked?: string | null; caption: string; captured_at: string }>;
}

export interface MaterialOutgoing {
  id: string;
  reference_no: string;
  project: string;
  project_name: string;
  material_name: string;
  quantity: string;
  unit: string;
  destination: string;
  executor_name: string;
  vehicle_plate: string;
  delivery_note_no: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RELEASED";
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  submitted_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  review_note: string;
  photos: Array<{
    id: string;
    image: string;
    watermarked?: string | null;
    caption: string;
    captured_at: string;
  }>;
}

export type DisposalRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_CONFIRMATION"
  | "RETURNED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type DisposalEvidenceKind =
  | "REQUEST"
  | "LOADING"
  | "UNLOADING"
  | "DISPOSAL_DO"
  | "OTHER"
  | "CONFIRMATION";

export interface DisposalEvidence {
  id: string;
  kind: DisposalEvidenceKind;
  image: string;
  watermarked?: string | null;
  note: string;
  captured_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  device_id: string;
  client_event_id: string;
  submitted_by_name: string | null;
}

export interface DisposalTimelineEntry {
  id: string;
  event: string;
  note: string;
  actor_name: string;
  happened_at: string;
}

export interface DisposalRequest {
  id: string;
  reference_no: string;
  project: string;
  project_name: string;
  /** The construction-waste column, filed by the office afterwards (T-232). */
  category: string | null;
  category_name: string | null;
  category_code: string | null;
  waste_description: string;
  location_description: string;
  estimated_volume_m3: string | null;
  estimated_weight_kg: string | null;
  preferred_at: string | null;
  request_note: string;
  client_event_id: string;
  status: DisposalRequestStatus;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  assignment_type: "INTERNAL" | "EXTERNAL" | "";
  assigned_staff: string | null;
  assigned_staff_name: string | null;
  execution_task: string | null;
  collector_company_name: string;
  collector_contact_name: string;
  collector_phone: string;
  collector_email: string;
  external_token_hint: string;
  external_expires_at: string | null;
  external_revoked_at: string | null;
  external_last_used_at: string | null;
  external_link_is_valid: boolean;
  execution_started_at: string | null;
  submitted_at: string | null;
  actual_weight_kg: string | null;
  trip_count: number;
  disposal_do_no: string;
  execution_note: string;
  ocr_status: "NOT_REQUESTED" | "SUCCEEDED" | "NOT_CONFIGURED" | "FAILED" | "MANUAL";
  ocr_result: Record<string, unknown>;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  confirmation_note: string;
  evidence: DisposalEvidence[];
  timeline: DisposalTimelineEntry[];
  created_at: string;
  updated_at: string;
}

export interface ExternalDisposalTask {
  id: string;
  reference_no: string;
  company_name: string;
  project_name: string;
  waste_description: string;
  location_description: string;
  estimated_volume_m3: string | null;
  estimated_weight_kg: string | null;
  preferred_at: string | null;
  request_note: string;
  status: DisposalRequestStatus;
  collector_company_name: string;
  collector_contact_name: string;
  external_expires_at: string;
  execution_started_at: string | null;
  submitted_at: string | null;
  actual_weight_kg: string | null;
  trip_count: number;
  disposal_do_no: string;
  execution_note: string;
  ocr_status: DisposalRequest["ocr_status"];
  evidence: DisposalEvidence[];
}

/**
 * The nine kinds of record the office's unarchived queue collects (D-107).
 *
 * Deliberately the same strings the backend's `core.models.RecordKind` uses:
 * the queue is a merge of nine tables and the kind is how a row says which
 * screen it came from, so a private spelling here would be a second
 * vocabulary for the same thing.
 */
export type ArchiveRecordKind =
  | "MATERIAL_RECEIPT"
  | "MATERIAL_OUTGOING"
  | "EQUIPMENT_MOVEMENT"
  | "HAZARD"
  | "WASTE_OUTGOING"
  | "DISPOSAL_REQUEST"
  | "PROGRESS"
  | "CONSULTANT_APPLICATION"
  | "ATTENDANCE_DAY";

/** One row of the unarchived queue, whichever table it came from. */
export interface ArchiveQueueRow {
  id: string;
  kind: ArchiveRecordKind;
  reference: string;
  detail: string;
  project_id: string | null;
  project_name: string;
  submitted_at: string;
  status: string;
  /** Beside `status` on purpose - see `MySubmissionRow` for why (F-225). */
  status_label: string;
  photo: string | null;
}

/**
 * A queue row, opened.
 *
 * Reuses `MySubmissionField` / `MySubmissionPhoto`: the phone's history sheet
 * and this screen render the same records through the same `mySubmissions.*`
 * catalogue, and a second set of field keys would be a second set of
 * translations to keep in step (F-342, D-133).
 */
export interface ArchiveQueueDetail extends ArchiveQueueRow {
  fields: import("@/interfaces/contractor").MySubmissionField[];
  photos: import("@/interfaces/contractor").MySubmissionPhoto[];
  is_seen: boolean;
}

export interface ArchiveQueuePage {
  results: ArchiveQueueRow[];
  count: number;
  /**
   * Per kind, because "eleven waiting" says less than "nine deliveries and two
   * hazards". Only the kinds this account may read appear, so the screen shows
   * no tab for a module the reader cannot open.
   */
  counts: Partial<Record<ArchiveRecordKind, number>>;
  kinds: ArchiveRecordKind[];
}
