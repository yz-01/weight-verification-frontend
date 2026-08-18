export type RecyclerCustomerType = "PLATFORM" | "PRIVATE";
export type RecyclerBusinessSource = "PLATFORM" | "PRIVATE";
export type PrivateIntakeState =
  | "WAITING_WEIGHING"
  | "COMPLETED"
  | "CANCELLED";
export type InventoryMovementKind = "INBOUND" | "OUTBOUND" | "ADJUSTMENT";
export type OutboundState = "DRAFT" | "CONFIRMED" | "CANCELLED";
export type OutboundAttachmentKind =
  | "DELIVERY_ORDER"
  | "E_INVOICE"
  | "PHOTO"
  | "OTHER";

export type RecyclerMaterialType =
  | "MIXED"
  | "CONCRETE"
  | "METAL"
  | "TIMBER"
  | "PLASTIC"
  | "PAPER"
  | "SOIL"
  | "HAZARDOUS"
  | "OTHER";

export const RECYCLER_MATERIAL_TYPES: readonly RecyclerMaterialType[] = [
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

export interface RecyclerCustomer {
  id: string;
  customer_no: string;
  customer_type: RecyclerCustomerType;
  platform_company: string | null;
  platform_company_code: string | null;
  company_name: string;
  registration_no: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  notes: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_no: string;
  bank_notes: string;
  is_active: boolean;
  qr_serial: string | null;
  qr_status: string | null;
  completed_intakes: number;
  total_weight_kg: string;
  last_transaction_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecyclerCustomerPayload {
  company_name: string;
  registration_no?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  notes?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_no?: string;
  bank_notes?: string;
}

export interface CustomerQr {
  id: string;
  serial: string;
  status: string;
  issued_on: string;
  last_scanned_at: string | null;
  scan_count: number;
  qr_payload: string;
}

export interface PrivateIntake {
  id: string;
  intake_no: string;
  customer: string;
  customer_no: string;
  customer_name: string;
  site: string;
  site_name: string;
  qr_serial: string;
  material_type: RecyclerMaterialType;
  vehicle_plate: string;
  notes: string;
  business_source: "PRIVATE";
  commission_eligible: false;
  state: PrivateIntakeState;
  gross_session: string | null;
  session_no: string | null;
  net_weight_kg: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  created_at: string;
}

export interface StartPrivateIntakePayload {
  token: string;
  site: string;
  material_type: RecyclerMaterialType;
  vehicle_plate?: string;
  notes?: string;
}

export interface InventoryAccount {
  id: string;
  material_type: RecyclerMaterialType;
  material_label: string;
  business_source: RecyclerBusinessSource;
  current_weight_kg: string;
  last_movement_at: string | null;
}

export interface InventoryTotals {
  PLATFORM: string;
  PRIVATE: string;
  TOTAL: string;
}

export interface InventorySnapshot {
  totals: InventoryTotals;
  results: InventoryAccount[];
}

export interface InventoryMovement {
  id: string;
  movement_no: string;
  material_type: RecyclerMaterialType;
  business_source: RecyclerBusinessSource;
  kind: InventoryMovementKind;
  quantity_kg: string;
  balance_after_kg: string;
  weigh_session: string | null;
  session_no: string | null;
  private_intake: string | null;
  intake_no: string | null;
  outbound: string | null;
  shipment_no: string | null;
  reason: string;
  occurred_at: string;
  recorded_by_name: string | null;
}

export interface InventoryAdjustmentPayload {
  material_type: RecyclerMaterialType;
  business_source: RecyclerBusinessSource;
  quantity_kg: string;
  reason: string;
}

export interface Buyer {
  id: string;
  buyer_no: string;
  company_name: string;
  registration_no: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  notes: string;
  is_active: boolean;
  shipment_count: number;
  total_weight_kg: string;
  created_at: string;
  updated_at: string;
}

export interface BuyerPayload {
  company_name: string;
  registration_no?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  notes?: string;
}

export interface OutboundAttachment {
  id: string;
  kind: OutboundAttachmentKind;
  file: string;
  description: string;
  created_at: string;
}

export interface OutboundShipment {
  id: string;
  shipment_no: string;
  buyer: string;
  buyer_no: string;
  buyer_name: string;
  material_type: RecyclerMaterialType;
  business_source: RecyclerBusinessSource;
  weight_kg: string;
  outbound_date: string;
  vehicle_plate: string;
  driver_name: string;
  e_invoice_no: string;
  notes: string;
  state: OutboundState;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  balance_after_kg: string | null;
  attachments: OutboundAttachment[];
  created_at: string;
  updated_at: string;
}

export interface OutboundShipmentPayload {
  buyer: string;
  material_type: RecyclerMaterialType;
  business_source: RecyclerBusinessSource;
  weight_kg: string;
  outbound_date: string;
  vehicle_plate?: string;
  driver_name?: string;
  e_invoice_no?: string;
  notes?: string;
}
