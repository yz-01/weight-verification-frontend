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
  /** The package a new contractor gets when none is chosen (11.2.2, JB213). */
  is_default: boolean;
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
  /** Last free day of a trial that has not been renewed yet (JB213, Q5). */
  trial_ends_on: string | null;
  /** The package's 付款周期, the default term for 续期 / 换套餐 (JB213). */
  plan_billing_cycle: BillingCycle | null;
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
  /** Left out: the package's own 付款周期 (JB213). */
  months?: number;
  expires_on?: string;
  reason: string;
}

export interface SetSeatsPayload {
  user_limit_override: number | null;
  reason: string;
}

/** What a new package starts with, from 11.2.2 SaaS 默认值 (JB213). */
export interface PlanDefaults {
  billing_cycle: BillingCycle;
  trial_days: number;
  max_users: number | null;
  default_plan: { id: string; code: string; name: string } | null;
  /** The menus a package can switch, per audience, in menu order. */
  feature_choices: Record<CompanyType, string[]>;
  /** Menus every package keeps, whatever is ticked. */
  always_on_features: string[];
}

/** Months in one 付款周期, as the server counts them. */
export const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};
