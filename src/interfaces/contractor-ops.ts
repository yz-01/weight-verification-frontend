export interface ProjectCategory {
  id: string;
  project: string;
  parent: string | null;
  parent_name: string | null;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_visible_in_pwa: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectCategoryPayload {
  project: string;
  parent?: string | null;
  code: string;
  name: string;
  description?: string;
  sort_order?: number;
  is_visible_in_pwa?: boolean;
  is_active?: boolean;
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
  caption: string;
  captured_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  device_id: string;
  client_event_id: string;
}

export interface FieldTask {
  id: string;
  project: string;
  project_name: string;
  title: string;
  task_type: FieldTaskType;
  instructions: string;
  assigned_to: string;
  assigned_to_name: string;
  category: string | null;
  category_name: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  due_at: string | null;
  status: FieldTaskStatus;
  evidence_required: number;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string;
  client_event_id: string;
  photos: FieldTaskPhoto[];
  photo_count: number;
  created_at: string;
  updated_at: string;
}

export interface FieldTaskPayload {
  project: string;
  title: string;
  task_type: FieldTaskType;
  instructions?: string;
  assigned_to: string;
  category?: string | null;
  priority?: FieldTask["priority"];
  due_at?: string | null;
  evidence_required?: number;
  client_event_id?: string;
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
  is_active: boolean;
  movement_count: number;
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
  delivery_note_no: string;
  vehicle_plate: string;
  operator_name: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  notes: string;
  ocr_status: string;
  client_event_id: string;
  photos: Array<{ id: string; image: string; kind: string; captured_at: string }>;
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
  photos: Array<{ id: string; image: string; caption: string; captured_at: string }>;
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
  | "CONFIRMATION";

export interface DisposalEvidence {
  id: string;
  kind: DisposalEvidenceKind;
  image: string;
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
