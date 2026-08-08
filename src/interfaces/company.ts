/** Tenant companies. */

import type { Locale } from "@/i18n/config";

export type CompanyType = "CONTRACTOR" | "RECYCLER";

export type CompanyStatus =
  "ACTIVE" | "TRIAL" | "SUSPENDED" | "OVERDUE" | "CLOSED";

export type CompanyReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type CompanyDocumentType =
  | "SSM_CERTIFICATE"
  | "SSM_FORM_9"
  | "SSM_FORM_24"
  | "SSM_FORM_49"
  | "BUSINESS_LICENCE"
  | "DOE_LICENCE"
  | "BANK_STATEMENT"
  | "DIRECTOR_IC"
  | "TAX_DOCUMENT"
  | "SIGNED_AGREEMENT"
  | "OTHER";

export interface CompanyDocument {
  id: string;
  company: string;
  document_type: CompanyDocumentType;
  document_type_display: string;
  title: string;
  reference_no: string;
  file_url: string | null;
  issued_on: string | null;
  expires_on: string | null;
  is_expired: boolean;
  verification_status: VerificationStatus;
  verified_at: string | null;
  verified_by_name: string | null;
  verification_note: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyBankAccount {
  id: string;
  company: string;
  bank_name: string;
  branch: string;
  swift_code: string;
  account_name: string;
  masked_account_number: string;
  account_type: "CURRENT" | "SAVINGS";
  currency: string;
  is_primary: boolean;
  is_active: boolean;
  verification_status: VerificationStatus;
  verified_at: string | null;
  verified_by_name: string | null;
  verification_note: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyOnboarding {
  company: string;
  review_status: CompanyReviewStatus;
  is_complete: boolean;
  missing: string[];
  documents: CompanyDocument[];
  bank_accounts: CompanyBankAccount[];
}

export interface CompanyBankAccountPayload {
  bank_name: string;
  branch?: string;
  swift_code?: string;
  account_name: string;
  account_number: string;
  account_type: "CURRENT" | "SAVINGS";
  currency?: string;
  is_primary?: boolean;
  notes?: string;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  audience: CompanyType;
  tier: "SUBSCRIPTION" | "PARTNER" | "STANDARD";
  billing_cycle: string;
  currency: string;
  monthly_fee: string;
  yearly_fee: string;
  setup_fee: string;
  trial_days: number;
  max_projects: number | null;
  max_users: number | null;
  max_sites: number | null;
  max_scales: number | null;
  earns_platform_commission: boolean;
  commission_rate_override: string | null;
  effective_commission_rate: string | null;
  allows_external_integration: boolean;
  allows_cloud_weighing: boolean;
  feature_flags: string[];
  is_public: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyRow {
  id: string;
  code: string;
  name: string;
  type: CompanyType;
  status: CompanyStatus;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  city: string;
  state: string;
  user_count: number;
  plan: string | null;
  plan_code: string | null;
  plan_name: string | null;
  project_limit: number | null;
  project_limit_override: number | null;
  user_limit: number | null;
  remaining_user_seats: number | null;
  project_total: number;
  project_active: number;
  project_completed: number;
  project_archived: number;
  recycler_statistics: {
    service_contractors: number;
    platform_weight_kg: number | string;
    private_weight_kg: number | string;
    total_weight_kg: number | string;
    commission_status: "NOT_APPLICABLE" | "OUTSTANDING" | "SETTLED";
  } | null;
  subscription_started_on: string | null;
  subscription_months: 1 | 3 | 6 | 12 | null;
  subscription_expires_on: string | null;
  subscription_expiry_is_custom: boolean | null;
  review_status: CompanyReviewStatus;
  created_at: string;
}

export interface CompanyDetail {
  id: string;
  code: string;
  name: string;
  type: CompanyType;
  status: CompanyStatus;
  registration_no: string;
  ssm_new_registration_no: string;
  ssm_registered_name: string;
  ssm_incorporated_on: string | null;
  ssm_expires_on: string | null;
  business_type: string;
  industry_code: string;
  tax_id: string;
  sst_no: string;
  paid_up_capital: string | null;
  employee_count: number | null;
  website: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  latitude: string | null;
  longitude: string | null;
  contact_person: string;
  contact_designation: string;
  contact_phone: string;
  contact_email: string;
  billing_email: string;
  finance_contact_person: string;
  finance_contact_phone: string;
  logo: string | null;
  default_language: Locale;
  timezone: string;
  plan: string | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_tier: "SUBSCRIPTION" | "PARTNER" | "STANDARD" | null;
  project_limit: number | null;
  project_limit_override: number | null;
  user_limit: number | null;
  user_limit_override: number | null;
  used_user_seats: number;
  remaining_user_seats: number | null;
  earns_platform_commission: boolean;
  commission_rate: string | null;
  subscription_started_on: string | null;
  subscription_months: 1 | 3 | 6 | 12 | null;
  subscription_expires_on: string | null;
  subscription_expiry_is_custom: boolean | null;
  review_status: CompanyReviewStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string;
  suspended_at: string | null;
  suspended_reason: string;
  has_verified_bank_account: boolean;
  documents: CompanyDocument[];
  bank_accounts: CompanyBankAccount[];
  onboarding: {
    is_complete: boolean;
    missing: string[];
    required_document_types: CompanyDocumentType[];
  };
  project_statistics: {
    total: number;
    active: number;
    completed: number;
    archived: number;
  } | null;
  recycler_statistics: {
    service_contractors: number;
    platform_weight_kg: number | string;
    private_weight_kg: number | string;
    total_weight_kg: number | string;
    commission_status: "NOT_APPLICABLE" | "OUTSTANDING" | "SETTLED";
  } | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyPayload {
  name: string;
  type: CompanyType;
  registration_no?: string;
  ssm_new_registration_no?: string;
  ssm_registered_name?: string;
  ssm_incorporated_on?: string | null;
  ssm_expires_on?: string | null;
  business_type?: string;
  industry_code?: string;
  tax_id?: string;
  sst_no?: string;
  paid_up_capital?: number | null;
  employee_count?: number | null;
  website?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  contact_person?: string;
  contact_designation?: string;
  contact_phone?: string;
  contact_email?: string;
  billing_email?: string;
  finance_contact_person?: string;
  finance_contact_phone?: string;
  logo?: File | null;
  default_language?: Locale;
  timezone?: string;
  plan?: string | null;
  project_limit_override?: number | null;
  user_limit_override?: number | null;
  subscription_months?: 1 | 3 | 6 | 12 | null;
  subscription_expires_on?: string | null;
  subscription_expiry_is_custom?: boolean;
}

export interface CompanyStatusPayload {
  status: Extract<CompanyStatus, "ACTIVE" | "SUSPENDED" | "CLOSED">;
  reason?: string;
}

export interface CompanyReviewPayload {
  status: Extract<CompanyReviewStatus, "APPROVED" | "REJECTED">;
  note?: string;
}

export interface CompanySummary {
  total: number;
  active: number;
  inactive: number;
  new_this_month: number;
  by_type: Partial<Record<CompanyType, number>>;
  by_status: Partial<Record<CompanyStatus, number>>;
}
