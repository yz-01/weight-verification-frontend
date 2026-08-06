/** Partner management (module 16) interfaces. */

export type PartnerType =
  | "INSTALLER"
  | "DISTRIBUTOR"
  | "REGIONAL_AGENT"
  | "REFERRAL"
  | "TECHNOLOGY"
  | "CUSTOM";

export type PartnerStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "TERMINATED";
export type AgreementStatus =
  | "DRAFT"
  | "PENDING_SIGNATURE"
  | "ACTIVE"
  | "EXPIRED"
  | "TERMINATED";
export type PartnerPayoutState =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PAID"
  | "REJECTED";

export interface Partner {
  id: string;
  code: string;
  name: string;
  company_name: string;
  type: PartnerType;
  custom_type: string;
  status: PartnerStatus;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  partnership_start: string;
  partnership_end: string | null;
  customers_referred: number;
  total_commission_earned: string;
  created_at: string;
}

export interface PartnerTypeDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PartnerDetail extends Partner {
  address: string;
  registration_number: string;
  tax_id: string;
  notes: string;
}

export interface PartnerAgreement {
  id: string;
  agreement_number: string;
  partner: { id: string; code: string; name: string };
  status: AgreementStatus;
  title: string;
  effective_from: string;
  effective_to: string | null;
  commission_basis: string;
  commission_rate: string;
  signed_on: string | null;
  description?: string;
  terms?: string;
  minimum_payout?: string | null;
  payout_cycle?: string;
  calculation_config?: Record<string, unknown>;
  version?: number;
  document_name?: string;
  terminated_on?: string | null;
  termination_reason?: string;
}

export interface PartnerCommissionPayout {
  id: string;
  payout_code: string;
  partner: { id: string; code: string; name: string };
  state: PartnerPayoutState;
  period_start: string;
  period_end: string;
  new_customers: number;
  saas_revenue: string;
  platform_commission_revenue?: string;
  total_revenue?: string;
  gross_amount: string;
  adjustment: string;
  net_amount: string;
  paid_on: string | null;
}

export interface CustomerReferral {
  id: string;
  partner: { id: string; code: string; name: string };
  company: { id: string; code: string; name: string };
  state: string;
  referred_on: string;
  commission_eligible: boolean;
  territory?: string | null;
  territory_name?: string | null;
  company_type?: string;
}

export interface PartnerSummary {
  total_partners: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  total_customers_referred: number;
  total_commission_paid: string;
}

export interface CreatePartnerPayload {
  name: string;
  company_name?: string;
  type: PartnerType;
  custom_type?: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  address?: string;
  registration_number?: string;
  partnership_start: string;
  partnership_end?: string | null;
  notes?: string;
}

export interface PartnerTerritory {
  id: string;
  partner: { id: string; code: string; name: string };
  name: string;
  is_national: boolean;
  states: string[];
  cities: string[];
  areas: string[];
  is_exclusive: boolean;
  effective_from: string;
  effective_to: string | null;
}

export interface PartnerPerformance {
  partner_id: string;
  partner_code: string;
  partner_name: string;
  new_customers: number;
  contractors: number;
  recyclers: number;
  saas_revenue: string;
  platform_commission_revenue: string;
  partner_commission: string;
}
