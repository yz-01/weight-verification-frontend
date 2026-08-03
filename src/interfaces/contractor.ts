/** The contractor console's records: sites, suppliers, deliveries and loads out. */

export type ProjectStatus = "PLANNING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";

export interface Project {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  description?: string;
  client_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  latitude?: string | null;
  longitude?: string | null;
  has_coordinates?: boolean;
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
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  start_date?: string | null;
  end_date?: string | null;
  site_manager?: string;
  site_phone?: string;
}

export interface ProjectAssignment {
  id: string;
  user: string;
  user_name: string;
  user_email: string;
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
  city: string;
  is_active: boolean;
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
  caption: string;
  latitude: string | null;
  longitude: string | null;
  taken_at: string | null;
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
  material_name: string;
  quantity: string;
  unit: MaterialUnit;
  unit_price: string | null;
  total_value: string | null;
  vehicle_plate: string;
  received_by_name: string;
  /** Stamped by the platform, never by the device that filed the receipt. */
  captured_at: string;
  has_location: boolean;
  photo_count?: number;
}

export interface MaterialReceiptDetail extends MaterialReceipt {
  qr_code: string | null;
  delivery_note_no: string;
  notes: string;
  signature: string | null;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  photos: ReceiptPhoto[];
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialReceiptPayload {
  project: string;
  supplier: string;
  qr_code?: string | null;
  material_name: string;
  quantity: string;
  unit: MaterialUnit;
  unit_price?: string | null;
  vehicle_plate?: string;
  delivery_note_no?: string;
  notes?: string;
  received_by_name: string;
  latitude?: string | null;
  longitude?: string | null;
  location_accuracy_m?: string | null;
}

export interface ReceiptSummary {
  total_receipts: number;
  by_unit: Array<{ unit: MaterialUnit; quantity: string; receipts: number }>;
  by_material: Array<{
    material_name: string;
    unit: MaterialUnit;
    quantity: string;
    receipts: number;
  }>;
}

export type WasteType =
  | "MIXED"
  | "CONCRETE"
  | "METAL"
  | "TIMBER"
  | "PLASTIC"
  | "SOIL"
  | "HAZARDOUS"
  | "OTHER";

export const WASTE_TYPES: WasteType[] = [
  "MIXED",
  "CONCRETE",
  "METAL",
  "TIMBER",
  "PLASTIC",
  "SOIL",
  "HAZARDOUS",
  "OTHER",
];

export type DispatchState =
  | "DRAFT"
  | "RELEASED"
  | "COLLECTED"
  | "WEIGHED"
  | "SETTLED"
  | "CANCELLED";

export const DISPATCH_STATES: DispatchState[] = [
  "DRAFT",
  "RELEASED",
  "COLLECTED",
  "WEIGHED",
  "SETTLED",
  "CANCELLED",
];

export interface DispatchPhoto {
  id: string;
  kind: "LOADING" | "VEHICLE" | "PLATE" | "OTHER";
  image: string;
  caption: string;
  latitude: string | null;
  longitude: string | null;
  taken_at: string | null;
  created_at: string;
}

export interface WasteDispatch {
  id: string;
  dispatch_no: string;
  project: string;
  project_code: string;
  project_name: string;
  recycler: string;
  recycler_name: string;
  waste_type: WasteType;
  estimated_weight_kg: string | null;
  vehicle_plate: string;
  driver_name: string;
  state: DispatchState;
  released_at: string | null;
  /** Only a draft is editable; after release the record is evidence. */
  is_editable: boolean;
  has_location: boolean;
  photo_count?: number;
}

export interface WasteDispatchDetail extends WasteDispatch {
  description: string;
  driver_phone: string;
  driver_ic: string;
  released_by_name: string;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  photos: DispatchPhoto[];
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
  by_type: Array<{
    waste_type: WasteType;
    dispatches: number;
    estimated_weight_kg: string | null;
  }>;
  by_state: Partial<Record<DispatchState, number>>;
}
