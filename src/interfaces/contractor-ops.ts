import type { InspectionInfo } from "@/interfaces/document-workflow";
import type { RecordedBy } from "@/interfaces/recorder";

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
  | "EQUIPMENT"
  | "PROGRESS"
  | "EHS"
  | "CONSTRUCTION_WASTE"
  // Their own columns since 2026-09-25 (D-274, D-275): consultant
  // submissions no longer file under the site-record columns, and sundry
  // claims and the period claims are filed by the office after the fact.
  | "CONSULTANT"
  | "SUNDRY"
  | "CLAIM"
  // 申请类型 (I16, ID36): a project's MR / Other Request types.
  | "REQUEST_TYPE";
/** 提交方式 (I12, ID28): 「提交总部审批」 is head office's to accept. */
export type CategorySubmissionMode = "DIRECT" | "REVIEW" | "CONSULTANT" | "HQ";

/** The business module a 分类组 belongs to (I11, ID1). */
export type CategoryGroupModule =
  | "MATERIAL"
  | "EQUIPMENT"
  | "EHS"
  | "RECYCLE"
  | "CLAIM"
  | "REQUEST_TYPE";

/** One 分类组 on the left of Category Management (I11), per project. */
export interface CategoryGroup {
  id: string;
  project: string;
  /** Blank on a system group: shown as its module's name. */
  name: string;
  module: CategoryGroupModule;
  sort_order: number;
  is_active: boolean;
  /** One per module per project: renamed and moved, never switched off or removed. */
  is_system: boolean;
  category_count: number;
}

/** What a material column's budget counts (2026-10 A6, X17). */
export type BudgetMode = "AMOUNT" | "QUANTITY";

export interface CategorySupplierOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface CategoryManufacturerOption {
  id: string;
  name: string;
  is_active: boolean;
}

/**
 * One specification of a material (I19, ID45): the material's second level,
 * with the unit it is measured in. 「其他」 (`is_other`) has no unit - whoever
 * chooses it types the specification and picks the unit.
 */
export interface MaterialSpec {
  id: string;
  code: string;
  name: string;
  default_unit: string;
  /** A unit the company added; null for a built-in code (translated). */
  default_unit_label: string | null;
  is_active: boolean;
  is_other: boolean;
  /** 「其他」: renamed, never switched off or removed. */
  is_fixed: boolean;
  sort_order: number;
}

export interface ProjectCategory {
  id: string;
  project: string;
  parent: string | null;
  parent_name: string | null;
  parent_sort_order?: number | null;
  code: string;
  name: string;
  kind: ProjectCategoryKind;
  /** Its 分类组 (I11); null on a row of a retired kind. */
  group?: string | null;
  group_name?: string | null;
  group_module?: CategoryGroupModule | null;
  group_sort_order?: number;
  group_is_system?: boolean;
  group_is_active?: boolean;
  /** A request type's form (I16): the material form or the simple one. */
  form_style?: "MATERIAL" | "GENERAL" | "";
  /** Seeded by the system (I16, I19): renamed, never switched off or removed. */
  is_fixed?: boolean;
  /** 「其他」: typed on the record (I19). */
  is_other?: boolean;
  /** A material's specifications, each with its unit, 「其他」 last (I19). */
  specs?: MaterialSpec[];
  submission_mode: CategorySubmissionMode;
  description: string;
  sort_order: number;
  /** Whether spending filed here counts against a budget; the owner's switch. */
  tracks_spend: boolean;
  /** Money, not weight - the amount comes off the supplier's delivery order. */
  budget_amount: string | null;
  budget_alert_percentages: number[];
  /** Money off the delivery orders (default), or the quantity in `default_unit` (A6). */
  budget_mode?: BudgetMode;
  /** The quantity budget, in `default_unit`; only read in quantity mode. */
  budget_quantity?: string | null;
  /** Absolute warning lines - RM, or the quantity - beside the percentages. */
  budget_alert_amounts?: number[];
  /** Received in the column's unit; null when the column has no unit. */
  quantity_used?: string | null;
  quantity_uncounted_deliveries?: number | null;
  /** The column's one unit (A4, Q1): the phone shows it and does not ask. */
  default_unit?: string;
  /** A unit the company added; null for a built-in code (translated). */
  default_unit_label?: string | null;
  /** Who may deliver this material (Q1). Ids to write; names below to show. */
  suppliers?: string[];
  supplier_options?: CategorySupplierOption[];
  /** 指定厂商 (D1, Q13): the factories the contract allows. */
  manufacturers?: string[];
  manufacturer_options?: CategoryManufacturerOption[];
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
   * What the category received, per unit (D-281): never added across units,
   * because cubic metres of concrete and tonnes of steel have no common
   * measure. A return is its own figure, not netted off.
   */
  quantities?: ColumnQuantity[];
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

/**
 * What a column form writes.
 *
 * No upload or edit lists (D-265, D-266): everyone who can see a column can
 * upload to it, and editing follows `category.manage` alone. `parent` only
 * for equipment (2026-10 B2, X1): a sub class names its major class; every
 * other kind is one flat list and the server ignores a parent sent for it.
 */
export interface ProjectCategoryPayload {
  project: string;
  /** The category a sub-category sits under (I11: every module); null at the top. */
  parent?: string | null;
  /** Its 分类组 (I11); left out, the module's own group. */
  group?: string | null;
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
  budget_mode?: BudgetMode;
  budget_quantity?: string | null;
  budget_alert_amounts?: number[];
  default_unit?: string;
  suppliers?: string[];
  manufacturers?: string[];
  is_visible_in_pwa?: boolean;
  is_active?: boolean;
  access_mode?: "ALL" | "RESTRICTED";
  allowed_roles?: string[];
  allowed_users?: string[];
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

export interface FieldTask extends RecordedBy {
  /** Record No. (I6): `FT-<project>-001`, running on per project. */
  record_no?: string;
  /** Sent in and waiting for this reader's 验收 - the sidebar counts it (2026-10-09). */
  needs_action?: boolean;
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
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
  /** Who confirmed or returned it - name, User ID and time (B18). */
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  review_note: string;
  client_event_id: string;
  linked_record_type: string;
  linked_record_id: string | null;
  linked_record_reference: string;
  linked_at: string | null;
  photos: FieldTaskPhoto[];
  references: FieldTaskReference[];
  photo_count: number;
  /**
   * The consultant application a manager made from this site request (B15):
   * one request, one application, sent on from the same item.
   */
  consultant_application?: {
    id: string;
    application_no: string;
    status: string;
    forwarded_at: string | null;
  } | null;
  /** HQ: published from the 公司总部 Dashboard (C17); SITE: everything else. */
  origin: "SITE" | "HQ";
  /** What the assignee wrote when submitting the result (C17). */
  result_note: string;
  /** The publisher's account; a head-office task's confirmer (B18). */
  created_by: string | null;
  /** Past due and not confirmed or cancelled, by the server's clock. */
  is_overdue?: boolean;
  /** 待处理 / 待验收 / 已完成 (I1), as the server reads the status. */
  stage?: "PENDING" | "AWAITING" | "DONE";
  /**
   * Whether this reader confirms it now - the setter or a task manager, never
   * the assignee (I1). It also means their conversation box has the
   * 「需要继续整改」 switch (ID11).
   */
  can_confirm?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * One row of 我的任务 / My Tasks (I1, ID14): a field task assigned to me or an
 * EHS item I fix, still 待处理. Each opens its own record, and is handed in
 * through that record's own endpoint.
 */
export interface MyTaskRow {
  kind: "FIELD_TASK" | "HAZARD";
  id: string;
  /** The hazard's number; a field task has none. */
  no: string;
  title: string;
  project: string;
  project_name: string;
  due_at: string | null;
  status: string;
  stage: "PENDING";
  /** Sent back with 「需要继续整改」 (ID11); `note` then says what is wrong. */
  needs_more_work: boolean;
  note: string;
  task_type: FieldTaskType | null;
  assigned_by_name: string;
  last_message: {
    author_name: string;
    body: string;
    kind: "text" | "photo" | "voice" | "file";
    sent_at: string | null;
  } | null;
  created_at: string | null;
}

/** A person a list's 负责人 filter offers. */
export interface PersonOption {
  id: string;
  full_name: string;
}

export interface FieldTaskPayload {
  /** Set only when head office publishes (C17); fixed afterwards. */
  origin?: "SITE" | "HQ";
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
  /** 检验 (J11-1): the latest inspection, or none. */
  inspection?: InspectionInfo | null;
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  project: string;
  project_name: string;
  code: string;
  name: string;
  serial_no: string;
  registration_no: string;
  supplier: string | null;
  supplier_name: string | null;
  /** The project column this machine files under, when one was chosen. */
  category: string | null;
  category_name: string | null;
  /** The major class that sub class sits under (2026-10 B2, X1). */
  category_parent?: string | null;
  category_parent_name?: string | null;
  description: string;
  status: EquipmentStatus;
  /**
   * When the paperwork runs out. Both nullable, because a contractor may not
   * hold a certificate for every item on site - and a null must not read as
   * expired.
   */
  certificate_expires_on: string | null;
  insurance_expires_on: string | null;
  /** PMA and permit (准证), added on the same machine (B14). */
  pma_expires_on?: string | null;
  permit_expires_on?: string | null;
  /** 路税到期 (2026-10 A8, X4). */
  road_tax_expires_on?: string | null;
  is_active: boolean;
  /**
   * Reported from the phone as 「新设备」 (C8): the office completes the
   * profile - plate, sub class, an expiry date - before accepting its entry.
   */
  needs_profile?: boolean;
  movement_count: number;
  quantity_on_site: string;
  /**
   * The way this machine's movement waiting for the office's acceptance goes,
   * else null (2026-10 C8, Q27): shown as 「进场待验收」 / 「退场待验收」.
   */
  awaiting_acceptance?: "ENTRY" | "EXIT" | null;
  /**
   * The exit under way for this machine, else null (2026-10 I13): applied
   * for (`PENDING`, 等待批准), approved (`APPROVED`, 已批准 / 等待退场) or
   * recorded on site (`SUBMITTED`, 已退场 / 待后台确认).
   */
  open_exit?: { id: string; status: "PENDING" | "APPROVED" | "SUBMITTED" } | null;
  /**
   * 设备编号 (IB18, I24): the office's 现场编号, printed big on the machine's
   * QR sticker; empty when none was given.
   */
  site_no?: string;
  /**
   * Every photograph of the machine (T-298): its own, uploaded onto the
   * register (`REGISTER`), and those taken at each entry and exit.
   */
  photos?: Array<{
    id: string;
    url: string;
    source: "REGISTER" | "ENTRY" | "EXIT";
    kind: string;
    caption: string;
    captured_at: string | null;
    /** Where it was taken: an entry or exit photo's own fix, else the entry's; none for a register upload. */
    latitude?: string | null;
    longitude?: string | null;
  }>;
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
  /**
   * The project column this machine files under (T-242).
   *
   * Optional, and null is a real answer: sites already carry machines nobody
   * has classified, and forcing a choice gets one invented (D-160).
   */
  category?: string | null;
  description?: string;
  /** ISO date, or null when the contractor does not hold the document. */
  certificate_expires_on?: string | null;
  insurance_expires_on?: string | null;
  pma_expires_on?: string | null;
  permit_expires_on?: string | null;
  road_tax_expires_on?: string | null;
  is_active?: boolean;
}

/**
 * Entry since 2026-10 (X2): recorded on site in one step (`SUBMITTED`), then
 * accepted (`COMPLETED`) or not (`REJECTED`) by the office.
 *
 * Exit since 2026-10 I13 (ID30), the way material leaves site: applied for
 * (`PENDING`) → approved on a Return Note (`APPROVED`, 已批准 / 等待退场) or
 * returned (`RETURNED`) → recorded on site (`SUBMITTED`, 已退场 / 待后台确认)
 * → confirmed (`COMPLETED`) or not (`REJECTED`).
 */
export type EquipmentMovementStatus =
  | "PENDING"
  | "APPROVED"
  | "RETURNED"
  | "COMPLETED"
  | "SUBMITTED"
  | "REJECTED";

export interface EquipmentMovement extends RecordedBy {
  /** Record No. (I6): `FT-<project>-001`, running on per project. */
  record_no?: string;
  /** 「提交总部审批」 (I12, ID28): head office accepts this machine's movements. */
  review_by_head_office?: boolean;
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  project: string;
  project_name: string;
  equipment: string;
  equipment_code: string;
  equipment_name: string;
  /** The machine's 现场编号 (I24). */
  equipment_site_no?: string;
  /** The machine's plate (2026-10 X4: 车牌号码). */
  equipment_registration_no?: string;
  /** A 「新设备」 whose profile the office has still to complete (C8). */
  equipment_needs_profile?: boolean;
  equipment_profile_missing?: Array<"registration_no" | "category" | "expiry">;
  direction: "ENTRY" | "EXIT";
  /** Movements recorded before 10-02 are all COMPLETED. */
  status?: EquipmentMovementStatus;
  request_note?: string;
  requested_by_name?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  review_note?: string;
  completed_by_name?: string | null;
  completed_at?: string | null;
  /** The office's final 确认 of an exit approved first (2026-10 I13). */
  accepted_by_name?: string | null;
  accepted_at?: string | null;
  /** Why that exit was not confirmed. */
  acceptance_note?: string;
  /** At the actual exit the machine's number was typed, not its QR scanned. */
  equipment_typed?: boolean;
  receiver_signature?: string | null;
  supplier_signature?: string | null;
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
  photos: Array<{
    id: string;
    image: string;
    watermarked?: string | null;
    kind: string;
    /** With the exit's application, at the handover, or the office's (I13). */
    stage?: "APPLICATION" | "HANDOVER" | "OFFICE";
    captured_at: string;
  }>;
  supplier?: string | null;
  /**
   * The Return Note an exit is approved on (2026-10 I13, the same note as
   * material's): empty until the office fills it.
   */
  has_return_note?: boolean;
  return_note_no?: string;
  return_note_at?: string | null;
  return_note_by_name?: string | null;
  return_note_material?: string;
  return_note_delivery_note_no?: string;
  return_note_supplier?: string | null;
  return_note_supplier_name?: string | null;
  return_note_quantity?: string | null;
  return_note_unit?: string;
  return_note_reason?: string;
  approver_name?: string;
  approver_user?: string | null;
  approver_user_name?: string | null;
  approver_signature?: string | null;
}

/** 设备清单: on site and total per supplier (2026-10 I36). */
export interface EquipmentSupplierCounts {
  /** Whether the rows are also split by project (a `project.view_all` reader on 全部项目). */
  by_project: boolean;
  on_site: number;
  total: number;
  results: Array<{
    /** Null: the machines with no supplier recorded. */
    supplier: string | null;
    supplier_name: string | null;
    project: string | null;
    project_name: string | null;
    on_site: number;
    total: number;
  }>;
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
  /** For the 施工分类 tab listing every project's phases (B17). */
  project_name?: string;
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

export interface SiteProgressRecord extends RecordedBy {
  /** Record No. (I6): `FT-<project>-001`, running on per project. */
  record_no?: string;
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  project: string;
  project_name: string;
  phase: string;
  phase_name: string;
  /** 实际完成比例; null when the site left it out (H5/H11, HD2). */
  percent_complete: string | null;
  /**
   * The progress column this record files under, or null while unfiled.
   *
   * Separate from the phase: the phase carries the weight the completion
   * percentage is computed against, the column is the customer'''s filing
   * dimension (D-127). Only old records carry one: the PROGRESS kind was
   * retired (2026-10 B1, X7) and the office's `file_record` action went with
   * it (p23), so a stored column is still shown but no longer set.
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
  /** The office's 【备注】, oldest first (T-359). */
  remarks?: Array<{ id: string; body: string; author_name: string | null; created_at: string }>;
  /**
   * Whether somebody pressed 【确认】 on it (a `RecordClosure`, X10). `status`
   * already reads CONFIRMED when it is; this says it is also locked.
   */
  archived?: boolean;
  /** Every office correction of 实际完成比例, oldest first (2026-10-09). */
  corrections?: ProgressCorrection[];
}

/** One office correction of a progress record's 实际完成比例 (2026-10-09). */
export interface ProgressCorrection {
  id: string;
  /** Null when the site had left the percentage out (H5/H11). */
  old_percent: string | null;
  new_percent: string;
  reason: string;
  author_name: string | null;
  created_at: string;
}

export interface MaterialOutgoing extends RecordedBy {
  /** The number before I6 renumbered it (「旧编号」); empty on a newer record. */
  legacy_no?: string;
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  reference_no: string;
  project: string;
  project_name: string;
  /** The material column it files under (T-372). */
  category?: string | null;
  category_name?: string | null;
  /** Since 10-02 a return to the supplier (A02, B11): the supplier first. */
  supplier?: string | null;
  supplier_name?: string | null;
  /** The delivery it sends back, and the figures copied from it. */
  source_receipt?: string | null;
  source_receipt_no?: string | null;
  source_receipt_quantity?: string | null;
  source_receipt_at?: string | null;
  /** The factory that made it (2026-10 D1), copied from the delivery unless changed. */
  manufacturer?: string | null;
  manufacturer_name?: string | null;
  manufacturer_off_list?: boolean;
  unit_label?: string | null;
  material_name: string;
  material_specification?: string;
  /** The specification from the project's material data (I19). */
  spec_category?: string | null;
  spec_category_name?: string | null;
  /** What the application asked to send back. */
  quantity: string;
  /** What actually left at the handover (B12); this comes off the net. */
  returned_quantity?: string | null;
  unit: string;
  destination: string;
  executor_name: string;
  vehicle_plate: string;
  delivery_note_no: string;
  reason: string;
  /**
   * 2026-10 C9: 申请 → Return Note → 批准 (APPROVED, 已批准 / 等待退场) →
   * 现场实际退场 (PROCESSED, 待后台确认) → 后台确认 (COMPLETED).
   * RELEASED is the pre-D-211 ending; rows in it still render.
   */
  status: "PENDING" | "APPROVED" | "REJECTED" | "PROCESSED" | "COMPLETED" | "RELEASED";
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  submitted_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  review_note: string;
  processed_at?: string | null;
  processed_by_name?: string | null;
  processing_note?: string;
  /** Both sides at the handover (B12): the site person and the supplier / driver. */
  site_signature?: string | null;
  supplier_signature?: string | null;
  completed_at?: string | null;
  completed_by_name?: string | null;
  photos: Array<{
    id: string;
    /** Which step it was taken at: with the application, after processing, or by the office. */
    stage?: "APPLICATION" | "PROCESSING" | "OFFICE";
    image: string;
    watermarked?: string | null;
    caption: string;
    captured_at: string;
  }>;
  /**
   * The Return Note the office fills before approving (2026-10 C9). Empty
   * until filled; `has_return_note` says whether approval can go ahead.
   */
  has_return_note?: boolean;
  return_note_no?: string;
  return_note_at?: string | null;
  return_note_by_name?: string | null;
  return_note_material?: string;
  return_note_delivery_note_no?: string;
  return_note_supplier?: string | null;
  return_note_supplier_name?: string | null;
  return_note_quantity?: string | null;
  return_note_unit?: string;
  return_note_reason?: string;
  approver_name?: string;
  approver_user?: string | null;
  approver_user_name?: string | null;
  approver_signature?: string | null;
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
  | "VEHICLE_EXIT"
  | "GATE_PASS"
  | "LOADING"
  | "UNLOADING"
  | "DISPOSAL_DO"
  | "OTHER"
  | "DISPOSAL_PROOF"
  | "CONFIRMATION";

/** What the site photographs as the load leaves (C08). */
export type DisposalSiteEvidenceKind = "VEHICLE_EXIT" | "GATE_PASS";

/**
 * Where a photograph belongs in the job (B23): the request, the load leaving
 * site, the final disposal proof, or an office check from before E04.
 */
export type DisposalEvidenceStage = "REQUEST" | "SITE_EXIT" | "FINAL_PROOF" | "OFFICE_CHECK";

/** 原工地清运's own figures (D06). */
export interface DisposalTotals {
  records: number;
  completed: number;
  trips: number;
  weight_kg: string;
  with_weight: number;
}

export interface DisposalEvidence {
  id: string;
  kind: DisposalEvidenceKind;
  stage?: DisposalEvidenceStage;
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
  /** Which lorry load this photograph belongs to (X11); empty for the rest. */
  trip?: string | null;
}

/**
 * One lorry load of a disposal job (X11, C5): planned at approval, sent by
 * the driver / field staff, checked by the office. Cancelled when the office
 * ended the job before it went.
 */
export type DisposalTripStatus = "PLANNED" | "SUBMITTED" | "ACCEPTED" | "CANCELLED";

export interface DisposalTrip {
  id: string;
  seq: number;
  status: DisposalTripStatus;
  weight_kg: string | null;
  do_no: string;
  /** Which lorry took this load (I27); "" when nobody typed it. */
  vehicle_plate: string;
  note: string;
  submitted_at: string | null;
  submitted_by_name: string;
  accepted_by_name: string | null;
  accepted_at: string | null;
  /** Q29.7: the office's corrections of this load, newest first. */
  corrections: DisposalTripCorrection[];
  evidence: DisposalEvidence[];
}

/** One office correction of a load's weight, DO number or plate (Q29.7, I27). */
export interface DisposalTripCorrection {
  id: string;
  field: "weight_kg" | "do_no" | "vehicle_plate";
  from: string;
  to: string;
  reason: string;
  by_name: string;
  at: string;
}

export interface DisposalTimelineEntry {
  id: string;
  event: string;
  note: string;
  actor_name: string;
  happened_at: string;
}

export interface DisposalRequest extends RecordedBy {
  /** The number before I6 renumbered it (「旧编号」); empty on a newer record. */
  legacy_no?: string;
  /** A request to accept or a lorry back to check, for this reader (2026-10-09). */
  needs_action?: boolean;
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
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
  /** The clearance company on the supplier list (I27); null for field staff's own or none yet. */
  collector_supplier: string | null;
  /** 供应商: the supplier's name, else the name typed before I27; "" for field staff's own. */
  supplier_name: string;
  /** The 供应商 column as a file prints it: 「内部清运 · 负责人」 for field staff's own. */
  supplier_label: string;
  /** 清运车牌: each lorry that took a load, once, in the order they went. */
  vehicle_plates: string[];
  vehicle_plates_text: string;
  collector_company_name: string;
  collector_contact_name: string;
  collector_phone: string;
  collector_email: string;
  external_token_hint: string;
  external_expires_at: string | null;
  external_revoked_at: string | null;
  external_last_used_at: string | null;
  external_link_is_valid: boolean;
  /**
   * Approved more than 36 hours ago with no disposal photograph back (D-217).
   *
   * Derived by the server, not stored: a flag needs something to run and set
   * it, and a job that did not run would leave every overdue record reading
   * "normal".
   */
  disposal_evidence_is_overdue: boolean;
  /** What the site asked for; approval makes this many trips (X11). */
  planned_trips: number;
  /** Each lorry and its check; empty on a job from before C5. */
  trips: DisposalTrip[];
  /** 「已验收 x / N 车」: N leaves out lorries cancelled by ending early. */
  trips_accepted: number;
  trips_total: number;
  /** When the office ended the job early; no more lorries after this. */
  trips_closed_at: string | null;
  execution_started_at: string | null;
  submitted_at: string | null;
  actual_weight_kg: string | null;
  trip_count: number;
  disposal_do_no: string;
  execution_note: string;
  ocr_status: "NOT_REQUESTED" | "PENDING" | "SUCCEEDED" | "NOT_CONFIGURED" | "FAILED" | "MANUAL";
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
  /** The lorries, as the driver needs them (X11): no office names. */
  trips: Array<{ id: string; seq: number; status: DisposalTripStatus; submitted_at: string | null }>;
  trips_total: number;
  trips_accepted: number;
  /** The lorry the next submission fills; null when every one is sent. */
  current_trip: { id: string; seq: number } | null;
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
  | "ATTENDANCE_DAY"
  | "SUNDRY_CLAIM"
  /** MR / 其他申请 (J30-2): packable in Multi Engine, not a 现场记录中心 row. */
  | "MATERIAL_REQUEST";

/**
 * Every kind a Category Management column can hold (T-396, D-276).
 *
 * Eight of the archive queue's kinds, plus five it does not collect: a
 * delivery note, a site record (or consultant submission), a registered
 * machine, a document and a period claim. The same strings the backend's
 * `contractor_ops/category_records.py` sends.
 */
export type CategoryRecordKind =
  | "MATERIAL_RECEIPT"
  | "DELIVERY_NOTE"
  | "MATERIAL_OUTGOING"
  | "SITE_RECORD"
  | "HAZARD"
  | "SITE_EQUIPMENT"
  | "EQUIPMENT_MOVEMENT"
  | "PROGRESS"
  | "DISPOSAL_REQUEST"
  | "WASTE_OUTGOING"
  | "DOCUMENT"
  | "SUNDRY_CLAIM"
  | "CLAIM";

/** Any kind a record detail sheet may be opened for. */
export type RecordSheetKind = ArchiveRecordKind | CategoryRecordKind;

/**
 * One row of the unarchived queue, whichever table it came from.
 *
 * Generic over the kind only because a column's list (T-396) sends the very
 * same shape for a wider set of kinds; the queue itself is the default.
 */
export interface ArchiveQueueRow<K extends string = ArchiveRecordKind> {
  /** The first photograph's watermarked thumbnail, or null (E3). */
  cover_photo_url?: string | null;
  /** How many photographs the record has (E3). */
  photo_count?: number;
  id: string;
  kind: K;
  reference: string;
  detail: string;
  project_id: string | null;
  project_name: string;
  /** Under the short number in a list (2026-10 D4); "" for a company-wide record. */
  project_code?: string;
  submitted_at: string;
  status: string;
  /** Beside `status` on purpose - see `MySubmissionRow` for why (F-225). */
  status_label: string;
  photo: string | null;
  /** A category's records only (2026-10 B3): the DO, "" when the kind has none. */
  delivery_note_no?: string;
  /** A category's records only (2026-10 B3): the supplier, "" when none. */
  supplier_name?: string;
  /**
   * Material receipts and returns (2026-10 D1): whose make, "" when nobody
   * said, and whether the category designates others (「非指定厂商」).
   */
  manufacturer_name?: string;
  manufacturer_off_list?: boolean;
  /** J34-2: the first photographs' thumbnails, cover first. */
  photo_thumbs?: string[] | null;
  /**
   * A category's records only (J34-6, 图 6): what the table shows where the
   * record has it - the plate, quantity, specification, note, receiver and
   * whether it carries GPS. A kind without them sends "" or null.
   */
  vehicle_plate?: string;
  specification?: string;
  quantity?: string | null;
  unit?: string;
  note?: string;
  received_by?: string;
  has_gps?: boolean;
  /** A material receipt's direction (B10), so a return is not named 材料进场. */
  movement_type?: "ENTRY" | "RETURN";
  /** A safety row's type: a 施工准证 opens as a permit, not a hazard card. */
  record_type?: "HAZARD" | "PERMIT";
  /** When this reader opened it in 现场记录中心 (未看 / 已看), or null (T-391, C4). */
  seen_at: string | null;
  /** Whether anything archives this kind at all; an attendance day does not. */
  archivable: boolean;
  /** Who archived it for everybody and when, or null while it is not archived. */
  archived: { by: string; at: string | null } | null;
}

/**
 * A queue row, opened.
 *
 * Reuses `MySubmissionField` / `MySubmissionPhoto`: the phone's history sheet
 * and this screen render the same records through the same `mySubmissions.*`
 * catalogue, and a second set of field keys would be a second set of
 * translations to keep in step (F-342, D-133).
 */
export interface ArchiveQueueDetail<K extends string = ArchiveRecordKind>
  extends ArchiveQueueRow<K>, RecordedBy {
  fields: import("@/interfaces/contractor").MySubmissionField[];
  photos: import("@/interfaces/contractor").MySubmissionPhoto[];
  is_seen: boolean;
}

/** The records filed in one column, newest first (T-396). */
export interface ColumnQuantity {
  /** The specification this line counts (J7-4); blank for records with none. */
  material_specification?: string;
  unit: string;
  received: string;
  returned: string;
  deliveries: number;
}

/** One material inside a material category, with its own total (D-281). */
export interface MaterialGroup extends ColumnQuantity {
  material_name: string;
  material_specification: string;
}

export interface CategoryRecordPage {
  results: ArchiveQueueRow<CategoryRecordKind>[];
  count: number;
  /** A material category only: each material with its count and total. */
  groups?: MaterialGroup[];
  /**
   * Whether any record kind in this module has a supplier (2026-10 B16): a
   * module whose records never come from one is offered the dates only.
   */
  supplier_filter?: boolean;
  /** Whether any record kind here has a manufacturer (2026-10 D1): material only. */
  manufacturer_filter?: boolean;
  /** Each tab's count under the same filters (J34-6), or null for a module without stages. */
  tabs?: Record<"all" | CategoryRecordStage, number> | null;
}

/** The page's tabs (J34-6): each record type's own states mapped onto three. */
export type CategoryRecordStage = "pending" | "done" | "returned";

/**
 * The figures above a column's records (J34-6, 图 6), counted from what is
 * filed in it. A material column measures deliveries in one unit (strings);
 * any other counts records (numbers).
 */
export interface CategorySummary {
  measure: "quantity" | "count";
  unit: string | null;
  unit_label: string | null;
  /** Loads in another unit, not converted into this one. */
  other_units: boolean;
  today: string | number;
  yesterday: string | number;
  month: string | number;
  /** The same days of last month, for 「较上月同期」. */
  last_month: string | number;
  total: string | number;
  target: {
    target_quantity: string;
    net: string;
    remaining: string;
    percent: number | null;
    status: string;
  } | null;
  /** How many suppliers delivered into it, or null where records have none. */
  suppliers: number | null;
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

/* -------------------------------------------------------------------------
 * Multi Engine: evidence packages (T-235)
 *
 * 客户：「用来 export pdf 的，就是可以把文件整合在一起然后打包成 PDF」.
 * ---------------------------------------------------------------------- */

export type PackageState = "DRAFT" | "CONFIRMED";
export type PackageReviewState = "NOT_SENT" | "SENT" | "REVIEWED";
export type PackageItemReviewState = "PENDING" | "ACCEPTED" | "RETURNED";
/** What a package is for (batch H, HD17). Progress Claim is opened by period. */
export type PackageType =
  | "PROGRESS_CLAIM"
  | "SUNDRY_CLAIM"
  | "APPROVAL"
  | "SUPPLIER"
  | "SAFETY_INCIDENT"
  | "OTHER";
export const PACKAGE_TYPES: readonly PackageType[] = [
  "PROGRESS_CLAIM",
  "SUNDRY_CLAIM",
  "APPROVAL",
  "SUPPLIER",
  "SAFETY_INCIDENT",
  "OTHER",
];
/** The types that carry an amount, a period, a collection and payment proofs. */
export const CLAIM_PACKAGE_TYPES: readonly PackageType[] = ["PROGRESS_CLAIM", "SUNDRY_CLAIM"];

/** Who a package went to (H17 四 2). Only a consultant signs in. */
/** HEADQUARTERS (J30-1): the company's own head office, in the system - no link. */
export type RecipientKind = "HEADQUARTERS" | "CONSULTANT" | "OWNER" | "SUPPLIER" | "OTHER";

/** Whether a recipient reads through a link (not a consultant, not head office). */
export function isLinkRecipient(kind: RecipientKind): boolean {
  return kind !== "CONSULTANT" && kind !== "HEADQUARTERS";
}
export type RecipientStatus = "SENT" | "VIEWED" | "SIGNED" | "REVOKED";
export type PackageEventKind =
  | "CONFIRMED"
  | "SENT"
  | "OPENED"
  | "DOWNLOADED"
  | "MESSAGE"
  | "ITEM_CONFIRMED"
  | "ITEM_RETURNED"
  | "RESUBMITTED"
  | "SIGNED"
  | "REVOKED"
  | "EXTENDED"
  | "LINK_REGENERATED"
  | "REPORT";

export interface PackageRecipient {
  id: string;
  kind: RecipientKind;
  consultant: string | null;
  display_name: string;
  name: string;
  organization: string;
  contact: string;
  status: RecipientStatus;
  is_expired: boolean;
  is_live: boolean;
  /** The link's last characters - the whole link is never stored. */
  token_hint: string;
  expires_at: string | null;
  revoked_at: string | null;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  seen_round: number;
  signed_name: string;
  signed_at: string | null;
  accepted_count: number;
  returned_count: number;
  pending_count: number;
  created_at: string;
  created_by_name: string;
  /** Only in the answer that made (or remade) the link. */
  token?: string;
}

/** One recipient's answer on one record. */
export interface PackageAnswer {
  recipient: string;
  recipient_name: string;
  recipient_kind: RecipientKind;
  decision: PackageItemReviewState;
  reason: string;
  actor_name: string;
  at: string | null;
  signed: boolean;
}

export interface PackageMessage {
  id: string;
  recipient: string;
  item: string | null;
  side: "OFFICE" | "RECIPIENT";
  author_name: string;
  body: string;
  attachment_name: string;
  /** An API path (office / consultant / link); fetched as a file. */
  attachment_url: string;
  created_at: string;
}

export interface PackageEvent {
  id: string;
  kind: PackageEventKind;
  round_no: number;
  recipient: string | null;
  recipient_name: string;
  item: string | null;
  actor_name: string;
  note: string;
  created_at: string;
  ip_address?: string | null;
}

export interface PackageRound {
  number: number;
  pdf_sha256: string;
  pdf_bytes: number;
  merge_report: PackageMergeNote[];
  confirmed_at: string;
  confirmed_by_name: string;
  reason: string;
}

export interface PaymentProof {
  id: string;
  file: string | null;
  name: string;
  preview_type: string | null;
  amount: string | null;
  note: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

/** Amount, period, collection and vouchers - claim types only (HD17). */
export interface PackageClaimFacet {
  type: PackageType;
  claim?: {
    id: string;
    claim_no: string;
    kind: ClaimKind;
    period: string;
    state: ClaimState;
    amount: string | null;
    payment_state: ClaimPaymentState;
    payment_note: string;
    payment_updated_at: string | null;
    payment_updated_by_name: string;
    payment_proofs: PaymentProof[];
  } | null;
  sundry_total?: string;
  sundry?: {
    id: string;
    claim_no: string;
    amount: string | null;
    state: string;
    payment_state: ClaimPaymentState;
    payment_proof_count: number;
  }[];
}

/** One selectable document on a record - today, a delivery order page. */
export interface PackageDocument {
  id: string;
  url: string;
  caption: string;
}

/** Everything of one record that can be ticked (D-149). */
export interface PackageRecordParts {
  kind: ArchiveRecordKind;
  id: string;
  reference: string;
  project_id: string | null;
  project_name: string;
  submitted_at: string;
  fields: import("@/interfaces/contractor").MySubmissionField[];
  photos: import("@/interfaces/contractor").MySubmissionPhoto[];
  documents: PackageDocument[];
  /** The record's general attachments (B28), one tickable part each. */
  files?: Array<{ id: string; name: string; uploaded_by_name: string; uploaded_at: string }>;
}

/**
 * The groups a packer ticks besides the fields (D12). Never the conversation
 * (E7, Q25): no PDF prints the chat.
 */
export type PackagePart = "photos" | "documents" | "files";

/**
 * Which parts of a record this member carries. A missing group means all of
 * it; an empty list means none (D-162).
 */
export interface PackageSelection {
  fields?: string[];
  photos?: string[];
  documents?: string[];
  files?: string[];
}

export interface PackageItem extends PackageRecordParts {
  /** The member's own id, not the record's - `record_id` is the record. */
  id: string;
  record_kind: ArchiveRecordKind;
  record_id: string;
  position: number;
  /** The round this version of the record entered the package in (H17). */
  round_no?: number;
  replaced_in_round?: number | null;
  selection: PackageSelection;
  review_state: PackageItemReviewState;
  returned_reason: string;
  returned_at: string | null;
  /**
   * True once the package is confirmed: what is shown came from the member's
   * own snapshot rather than from the live record (D-153).
   */
  is_snapshot: boolean;
  /** The record this member points at can no longer be read from here. */
  source_missing?: boolean;
  /** Office only: each recipient's answer on this record (H17 六 3). */
  answers?: PackageAnswer[];
}

export interface EvidencePackageRow {
  id: string;
  /** 资料包编号, `PKG-<project>-<YYMMDD>-<NNN>` (2026-10-10). */
  package_no?: string;
  name: string;
  remarks: string;
  package_type?: PackageType;
  state: PackageState;
  project: string;
  project_name: string;
  created_at: string;
  created_by_name: string;
  /** H3 / HD20: who confirmed it. */
  confirmed_by_name?: string;
  /** The latest locked round; 0 for a draft. */
  current_round?: number;
  recipient_count?: number;
  confirmed_at: string | null;
  pdf_sha256: string;
  pdf_bytes: number;
  merge_report: PackageMergeNote[];
  review_state: PackageReviewState;
  sent_at: string | null;
  sent_to: string | null;
  sent_to_name: string;
  exported_at: string | null;
  item_count: number;
  returned_count: number;
  /** A draft can be deleted; a confirmed package cannot (D-142). */
  can_delete: boolean;
  /**
   * Whether the return path still exists (D-148). Sent by the server so the
   * screen can say why instead of offering a button that answers with an
   * error.
   */
  can_return: boolean;
}

export interface EvidencePackageDetail extends EvidencePackageRow {
  items: PackageItem[];
  /** Records the last add call would not take, and why. */
  refused?: { id: string; reason: string }[];
  /** Which round `items` are (the latest unless one was asked for). */
  viewing_round?: number;
  /* The office's view of a confirmed package (H17 八 1). */
  recipients?: PackageRecipient[];
  rounds?: PackageRound[];
  returned_item_ids?: string[];
  can_resubmit?: boolean;
  claim?: PackageClaimFacet | null;
  /* The consultant's view: their own recipient row (H17 五 2). */
  recipient?: PackageRecipient;
  can_sign?: boolean;
}

/** What the package link's page shows (H17 八 3): no money, one thread. */
export interface PackageLinkPage {
  company_name: string;
  company_logo: string;
  project_name: string;
  project_code: string;
  package_no: string;
  package_name: string;
  remarks: string;
  round: number;
  confirmed_at: string | null;
  recipient: {
    display_name: string;
    kind: RecipientKind;
    organization: string;
    status: RecipientStatus;
    signed_name: string;
    signed_at: string | null;
    expires_at: string | null;
    seen_round: number;
  };
  exported: boolean;
  can_decide: boolean;
  can_sign: boolean;
  items: PackageLinkItem[];
  messages: PackageMessage[];
}

export interface PackageLinkItem {
  id: string;
  record_kind: ArchiveRecordKind;
  reference: string;
  fields: import("@/interfaces/contractor").MySubmissionField[];
  photo_count: number;
  document_count: number;
  file_count: number;
  round_no: number;
  review_state: PackageItemReviewState;
  returned_reason: string;
  answered_by: string;
  answered_at: string | null;
}

/**
 * Why a row of a module's list cannot be ticked into the package being put
 * together (2026-10-10, 添加资料及勾选关联); "" when it can.
 */
export type PackRowReason =
  | ""
  | "in_package"
  | "package_closed"
  | "not_finished"
  | "other_project"
  | "no_package";

/** One row of a module's list, as Multi Engine sees it. */
export interface PackRowStatus {
  /** 「已打包 X 次」: standing links; a link taken out of a draft does not count. */
  count: number;
  /** 「已加入当前资料包」. */
  in_package: boolean;
  can_add: boolean;
  reason: PackRowReason;
}

/** The package being put together, as far as a module's list needs it. */
export interface PackBrief {
  id: string;
  package_no: string;
  name: string;
  project: string;
  state: PackageState;
}

/** `pack_status`: one page of a module's list, three queries whatever its length. */
export interface PackStatus {
  package: PackBrief | null;
  records: Record<string, PackRowStatus>;
}

/** What 「加入当前资料包」 did. */
export interface PackageLinkResult {
  added: number;
  already_in: number;
  refused: { id: string; reason: string }[];
  package: PackBrief & { item_count: number };
}

/** One package a record was packed into (「已打包 X 次」 opened). */
export interface RecordPackageRow {
  package: string;
  package_no: string;
  name: string;
  project_name: string;
  state: PackageState;
  review_state: PackageReviewState;
  sent_to_name: string;
  sent_at: string | null;
  confirmed_at: string | null;
  added_at: string;
  added_by_name: string;
  item_review_state: PackageItemReviewState;
  returned_reason: string;
  /** H17 七: one line per recipient - 「PKG · 顾问 A：退回——照片不清楚」. */
  answers?: PackageAnswer[];
  round_no?: number;
}

/** One line of "what did not make it into the PDF, and why" (D-141). */
export interface PackageMergeNote {
  item_id: string;
  reference: string;
  reason: string;
  detail: string;
}


/* -------------------------------------------------------------------------
 * Claim Engine (T-236)
 *
 * A claim is what one site is asking for in one month. The review and return
 * of it is not modelled here: a confirmed claim carries an
 * `EvidencePackage`, and that is what the consultant works on (D-158) - so
 * these types carry the package's id and state rather than a second copy of
 * its review machinery.
 * ---------------------------------------------------------------------- */

/** 「一般」 Claim (I10, ID50): no records to tick - a description, an amount, papers. */
export type ClaimKind = "MATERIAL_ON_SITE" | "PROGRESS" | "GENERAL";
export type ClaimState = "DRAFT" | "CONFIRMED";
export type ClaimItemState = "SELECTED" | "CLAIMED" | "RETURNED";
export type ClaimPaymentState = "NOT_RECEIVED" | "PARTIAL" | "RECEIVED";

export interface ClaimRow {
  id: string;
  claim_no: string;
  kind: ClaimKind;
  /** The first day of the month being claimed for (D-164). */
  period: string;
  state: ClaimState;
  remarks: string;
  project: string;
  project_name: string;
  project_code: string;
  package: string | null;
  package_state: string;
  package_review_state: string;
  payment_state: ClaimPaymentState;
  payment_note: string;
  payment_updated_at: string | null;
  /** HD17: the amount this claim asks for. */
  amount?: string | null;
  item_count: number;
  returned_count: number;
  confirmed_at: string | null;
  confirmed_by_name: string;
  created_by_name: string;
  created_at: string;
  /** The project's claim category (I10, ID6); null is 未分类. */
  category: string | null;
  /** 「Other Claim · what was typed」 for the fixed 「其他」 (ID43). */
  category_name: string | null;
  category_is_other?: boolean;
  other_name?: string;
  /** 分包商 (I10, ID7): a company on the supplier list marked subcontractor. */
  subcontractor?: string | null;
  subcontractor_name?: string | null;
  /** What a general claim is for (ID50). */
  description?: string;
}

export interface ClaimItem {
  id: string;
  record_kind: ArchiveRecordKind;
  record_id: string;
  state: ClaimItemState;
  returned_reason: string;
  returned_at: string | null;
  returned_by_name: string;
  created_at: string;
  /** The record itself, built by the same source table the queue uses. */
  record: ArchiveQueueRow | null;
  source_missing: boolean;
}

export interface ClaimDetail extends ClaimRow {
  items: ClaimItem[];
  /** HD17: the payment vouchers, write-once. */
  payment_proofs?: PaymentProof[];
  /** Records the last tick would not take: already claimed, or not this site's. */
  refused?: string[];
}

/** 符合条件／已查看／已选／未查看 (D-134). */
export interface ClaimCounts {
  eligible: number;
  seen: number;
  unseen: number;
  selected: number;
}

export interface ClaimCandidateRow extends ArchiveQueueRow {
  /** Read from `core.RecordSeen`, per person (F-353). */
  seen: boolean;
  selected: boolean;
}

export interface ClaimCandidatePage {
  results: ClaimCandidateRow[];
  count: number;
  counts: ClaimCounts;
}
