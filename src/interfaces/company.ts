/** Tenant companies. */

import type { Locale } from "@/i18n/config";

export type CompanyType = "CONTRACTOR" | "RECYCLER";

export type CompanyStatus =
  | "ACTIVE"
  | "TRIAL"
  | "SUSPENDED"
  | "OVERDUE"
  | "CLOSED";

export type CompanyReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  max_projects: number | null;
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
  subscription_started_on: string | null;
  subscription_months: 1 | 3 | 6 | 12 | null;
  subscription_expires_on: string | null;
  subscription_expiry_is_custom: boolean;
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
  tax_id: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  logo: string | null;
  default_language: Locale;
  timezone: string;
  plan: string | null;
  plan_code: string | null;
  plan_name: string | null;
  project_limit: number | null;
  project_limit_override: number | null;
  subscription_started_on: string | null;
  subscription_months: 1 | 3 | 6 | 12 | null;
  subscription_expires_on: string | null;
  subscription_expiry_is_custom: boolean;
  review_status: CompanyReviewStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string;
  suspended_at: string | null;
  suspended_reason: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyPayload {
  name: string;
  type: CompanyType;
  registration_no?: string;
  tax_id?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  default_language?: Locale;
  timezone?: string;
  plan?: string | null;
  project_limit_override?: number | null;
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
  by_type: Partial<Record<CompanyType, number>>;
  by_status: Partial<Record<CompanyStatus, number>>;
}
