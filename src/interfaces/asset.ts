/** Complete MSE asset lifecycle contracts for admin module 17. */

export type AssetCategory =
  | "GATEWAY" | "AI_CCTV" | "ANPR_CAMERA" | "INDUSTRIAL_COMPUTER"
  | "INDUSTRIAL_GATEWAY" | "ROUTER" | "SIM_CARD" | "DEMO_KIT"
  | "NOTEBOOK" | "TABLET" | "MOBILE_PHONE" | "TEST_EQUIPMENT"
  | "TOOL" | "LED_DISPLAY" | "BARRIER_GATE" | "NETWORK_SWITCH"
  | "UPS" | "SERVER" | "OTHER";

export type AssetStatus =
  | "IN_STOCK" | "DEPLOYED" | "BORROWED" | "MAINTENANCE"
  | "FAULTY" | "RETIRED";
export type MovementType =
  | "PURCHASE" | "ISSUE" | "INSTALL" | "TRANSFER" | "RETURN"
  | "REPAIR" | "DISPOSAL";
export type MaintenanceType =
  | "PREVENTIVE" | "CORRECTIVE" | "CALIBRATION" | "UPGRADE" | "INSPECTION";
export type MaintenanceStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AssignmentStatus = "BORROWED" | "RETURNED" | "OVERDUE";
export type InstallationStatus = "INSTALLED" | "ACTIVE" | "INACTIVE" | "REMOVED";
export type DisposalStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
export type PurchaseDeliveryStatus = "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface AssetRef { id: string; asset_code: string; name: string }

export interface Asset {
  id: string;
  asset_code: string;
  category: AssetCategory;
  custom_category: string | null;
  custom_category_name: string | null;
  purchase: string | null;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
  status: AssetStatus;
  is_active: boolean;
  purchase_date: string;
  purchase_price: string;
  supplier: string;
  invoice_number: string;
  warranty_period_months: number;
  warranty_expires_on: string | null;
  deployed_at: string | null;
  deployed_company_name: string | null;
  deployed_on: string | null;
  current_holder: string | null;
  holder_name: string | null;
  current_department: string | null;
  department_name: string | null;
  current_warehouse: string;
  current_project: string | null;
  project_name: string | null;
  specifications: Record<string, unknown>;
  firmware_version: string;
  ip_address: string | null;
  mac_address: string;
  location_notes: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type AssetDetail = Asset;
export interface CreateAssetPayload {
  category: AssetCategory;
  custom_category?: string | null;
  name: string;
  brand?: string;
  model?: string;
  serial_number: string;
  purchase_date: string;
  purchase_price: string;
  supplier?: string;
  invoice_number?: string;
  warranty_period_months?: number;
  specifications?: Record<string, unknown>;
  firmware_version?: string;
  ip_address?: string | null;
  mac_address?: string;
  location_notes?: string;
  notes?: string;
}

export interface AssetCategoryDefinition {
  id: string; code: string; name: string; description: string;
  is_system: boolean; is_active: boolean; created_at: string;
}

export interface AssetPurchase {
  id: string; purchase_code: string; supplier: string; purchase_date: string;
  category: AssetCategory; custom_category: string | null; custom_category_name: string | null;
  asset_name: string; brand: string; model: string; quantity: number;
  received_quantity: number; unit_price: string; total_amount: string;
  purchaser: string | null; purchaser_name: string | null;
  delivery_status: PurchaseDeliveryStatus; received_on: string | null;
  received_by_name: string | null; invoice_number: string;
  warranty_period_months: number; asset_count: number; notes: string;
  created_at: string; updated_at: string;
}

export interface AssetAssignment {
  id: string; assignment_code: string; asset: AssetRef; holder: string;
  holder_name: string; assigned_by_name: string | null; borrowed_on: string;
  expected_return_on: string | null; returned_on: string | null;
  status: AssignmentStatus; purpose: string; return_condition: string;
  notes: string; created_at: string;
}

export interface AssetInstallation {
  id: string; installation_code: string; asset: AssetRef; company: string;
  company_name: string; project: string | null; project_name: string | null;
  location: string; installed_on: string; installed_by: string | null;
  installed_by_name: string | null; activated_on: string | null;
  status: InstallationStatus; removed_on: string | null; notes: string;
  created_at: string;
}

export interface AssetMovement {
  id: string; movement_code: string; asset: AssetRef; type: MovementType;
  from_location: string; to_location: string; from_company: string | null;
  to_company: string | null; from_user: string | null; to_user: string | null;
  from_user_name: string | null; to_user_name: string | null;
  from_department: string | null; to_department: string | null;
  from_department_name: string | null; to_department_name: string | null;
  from_warehouse: string; to_warehouse: string;
  from_project: string | null; to_project: string | null;
  from_project_name: string | null; to_project_name: string | null;
  movement_date: string; quantity: number; reason: string;
  handled_by_name: string | null; notes: string; created_at: string;
}

export interface AssetMaintenance {
  id: string; maintenance_code: string; asset: AssetRef; type: MaintenanceType;
  status: MaintenanceStatus; fault_date: string | null; is_recurring: boolean;
  scheduled_date: string; completed_date: string | null; description: string;
  work_performed: string; parts_replaced: string; technician: string | null;
  technician_name: string | null; labor_cost: string | null; parts_cost: string | null;
  total_cost: string | null; result: string; next_maintenance_date: string | null;
  reminder_sent_at: string | null; document: string | null; created_at: string;
}

export interface AssetDisposal {
  id: string; disposal_code: string; asset: AssetRef; status: DisposalStatus;
  requested_on: string; requested_by_name: string | null; disposal_date: string | null;
  reason: string; disposal_method: string; salvage_value: string | null;
  disposal_cost: string | null; approved_by_name: string | null;
  approved_on: string | null; approval_note: string; rejection_reason: string;
  document: string | null; notes: string; created_at: string;
}

export interface AssetStock {
  category: AssetCategory; total_quantity: number; in_stock_quantity: number;
  deployed_quantity: number; borrowed_quantity: number; maintenance_quantity: number;
  faulty_quantity: number; retired_quantity: number; total_value: string;
}
export interface AssetSummary {
  total_assets: number; by_category: Record<string, number>;
  by_status: Record<string, number>; total_value: string;
  active_assets: number; inactive_assets: number;
}
export interface AssetOptions {
  users: Array<{ id: string; full_name: string; email: string }>;
  departments: Array<{ id: string; name: string; code: string }>;
  companies: Array<{ id: string; code: string; name: string; type: string }>;
  projects: Array<{ id: string; code: string; name: string; company_id: string }>;
}
export interface AssetReportSummary {
  assets: number; inventory: Array<Record<string, string | number>>;
  purchases: number; assignments: number; installations: number;
  movements: number; maintenance: number; disposals: number;
}
