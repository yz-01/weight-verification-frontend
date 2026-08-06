/** Subscription management (Admin module 4) interfaces. */

export type CompanyType = "CONTRACTOR" | "RECYCLER";
export type PlanTier = "SUBSCRIPTION" | "PARTNER" | "STANDARD";
export type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
export type SubscriptionState =
  | "NOT_STARTED"
  | "ACTIVE"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "PAUSED";

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  audience: CompanyType;
  tier: PlanTier;
  billing_cycle: BillingCycle;
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
  is_active: boolean;
  sort_order: number;
  company_count: number;
  created_at: string;
  updated_at: string;
}

export interface CompanySubscription {
  id: string;
  company_code: string;
  company_name: string;
  company_type: CompanyType;
  status: string;
  plan: string | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_tier: PlanTier | null;
  monthly_fee: string | null;
  subscription_state: SubscriptionState;
  subscription_started_on: string | null;
  subscription_months: number | null;
  subscription_expires_on: string | null;
  subscription_expiry_is_custom: boolean;
  days_to_expiry: number | null;
  user_limit: number | null;
  used_user_seats: number;
  remaining_user_seats: number | null;
  earns_platform_commission: boolean;
  commission_rate: string | null;
}

export interface SubscriptionSummary {
  active: number;
  expiring_soon: number;
  expired: number;
  paused: number;
  not_started: number;
  started_this_month: number;
  renewed_this_month: number;
  monthly_revenue: string;
  by_tier: Partial<Record<PlanTier, number>>;
}

export interface SubscriptionPlanPayload {
  code: string;
  name: string;
  description: string;
  audience: CompanyType;
  tier: PlanTier;
  billing_cycle: BillingCycle;
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
  allows_external_integration: boolean;
  allows_cloud_weighing: boolean;
  feature_flags: string[];
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface ChangePlanPayload {
  plan: string;
  months?: number;
  effective_immediately?: boolean;
  reason: string;
}

export interface ExtendSubscriptionPayload {
  months?: number;
  expires_on?: string;
  reason: string;
}

export interface SetSeatsPayload {
  user_limit_override: number | null;
  reason: string;
}
