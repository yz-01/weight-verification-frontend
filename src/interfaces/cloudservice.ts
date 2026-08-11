/** Cloud operations contracts for admin module A17. */

export type ServiceType =
  | "CLOUD_STORAGE" | "VIDEO_STORAGE" | "DATABASE" | "API_GATEWAY"
  | "AI_SERVICE" | "CWE" | "MAP_SERVICE" | "SMS_SERVICE" | "EMAIL_SERVICE"
  | "PUSH_NOTIFICATION" | "DOMAIN" | "SSL_CERTIFICATE" | "CDN" | "BACKUP"
  | "MONITORING" | "OTHER";
export type ServiceStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "SUSPENDED";
export type PricingModel = "PAY_AS_YOU_GO" | "FIXED_MONTHLY" | "TIERED" | "PER_UNIT";
export type UsageSourceMode = "MANUAL" | "SIMULATED" | "LIVE";

export interface CloudServiceVendor {
  id: string; code: string; name: string; description: string; contact_email: string;
  support_url: string; portal_url: string; account_id: string; is_active: boolean;
  notes: string; created_at: string; updated_at: string;
}
export interface CloudService {
  id: string; service_code: string; vendor: string; vendor_name: string;
  type: ServiceType; custom_type: string; status: ServiceStatus; name: string;
  description: string; region: string; service_plan_name: string;
  operation_mode: UsageSourceMode; subscription_start: string;
  subscription_end: string | null; pricing_model: PricingModel; base_cost: string;
  usage_unit: string; cost_per_unit: string | null; monthly_quota: string | null;
  alert_threshold: string; config: Record<string, unknown>; notes: string;
  created_at: string; updated_at: string;
}
export interface CloudServicePlan {
  id: string; plan_code: string; name: string; description: string;
  storage_gb: number; video_storage_gb: number; database_gb: number;
  api_requests: number; ai_requests: number; sms_count: number; email_count: number;
  push_notification_count: number; map_api_calls: number;
  other_limits: Record<string, number>; monthly_fee: string; is_active: boolean;
  created_at: string; updated_at: string;
}
export interface CloudPricingRule {
  id: string; rule_code: string; service_type: ServiceType; name: string;
  description: string; pricing_model: PricingModel; base_fee: string;
  unit_price: string | null; usage_unit: string; tiers: Array<Record<string, number>>;
  calculation_config: Record<string, unknown>; effective_from: string;
  effective_to: string | null; is_active: boolean; created_at: string; updated_at: string;
}
export interface ServiceUsage {
  id: string; service_code: string; service_name: string; service_type: ServiceType;
  company_name: string | null; project_name: string | null; year: number; month: number;
  usage_date: string; usage_amount: string; usage_unit: string; base_cost: string;
  usage_cost: string; total_cost: string; charge_amount: string; profit: string;
  source_mode: UsageSourceMode; recorded_at: string; notes: string;
}
export interface CloudBudget {
  id: string; code: string; company: string | null; company_name: string | null;
  project: string | null; project_name: string | null; year: number; month: number;
  amount: string; alert_threshold_percent: string; is_active: boolean;
  actual_cost: string; variance: string; usage_percent: string; notes: string;
  created_at: string; updated_at: string;
}
export interface CostAlert {
  id: string; service: string; service_code: string; service_name: string;
  company: string | null; company_name: string | null; project: string | null;
  project_name: string | null; alert_type: string; threshold: string;
  current_value: string; is_resolved: boolean; resolved_at: string | null;
  notification_sent_at: string | null; message: string; created_at: string;
}
export interface CloudSummary {
  total_services: number; active_services: number; by_type: Record<string, number>;
  by_status: Record<string, number>; monthly_base_cost: string;
  current_month_usage_cost: string; current_month_revenue: string;
  current_month_profit: string; open_alerts: number; expiring_services: number;
}
export interface CloudOptions {
  service_types: Array<{ value: ServiceType; label: string }>;
  companies: Array<{ id: string; code: string; name: string; type: string }>;
  projects: Array<{ id: string; code: string; name: string; company_id: string }>;
}
export interface CloudStatistics {
  records: number; usage: string; cost: string; revenue: string; profit: string;
  by_type: Array<Record<string, string>>; by_company: Array<Record<string, string>>;
  by_project: Array<Record<string, string>>;
}
export interface CloudAnalysis {
  total_usage: string; total_cost: string; total_revenue: string; profit: string;
  resource_ranking: Array<Record<string, string>>; storage_ranking: Array<Record<string, string>>;
  api_ranking: Array<Record<string, string>>; ai_ranking: Array<Record<string, string>>;
  top_customers: Array<Record<string, string>>; top_projects: Array<Record<string, string>>;
  trends: Array<Record<string, string>>;
}
