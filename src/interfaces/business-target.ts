export type TargetType = "QUANTITY" | "WEIGHT" | "COUNT";
export type TargetMetric =
  | "FIELD_TASK_COUNT"
  | "MATERIAL_RECEIPT_COUNT"
  | "MATERIAL_RECEIPT_QUANTITY"
  | "SETTLED_RECYCLING_WEIGHT";
export type TargetPeriod =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "ONE_TIME";

export interface BusinessTarget {
  id: string;
  company: string;
  company_name: string;
  project: string | null;
  project_name: string | null;
  category: string | null;
  category_name: string | null;
  name: string;
  description: string;
  target_type: TargetType;
  metric: TargetMetric;
  material_keyword: string;
  material_unit: string;
  waste_type: string;
  period: TargetPeriod;
  target_value: string;
  current_value: string;
  completion_percent: string;
  remaining_value: string;
  period_start: string;
  period_end: string;
  notify_at_50: boolean;
  notify_at_80: boolean;
  notify_at_90: boolean;
  notify_at_100: boolean;
  notified_50: boolean;
  notified_80: boolean;
  notified_90: boolean;
  notified_100: boolean;
  notify_user_ids: string[];
  is_active: boolean;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessTargetPayload {
  project?: string | null;
  category?: string | null;
  name: string;
  description?: string;
  target_type?: TargetType;
  metric: TargetMetric;
  material_keyword?: string;
  material_unit?: string;
  waste_type?: string;
  period: TargetPeriod;
  target_value: string;
  period_start: string;
  period_end: string;
  notify_at_50?: boolean;
  notify_at_80?: boolean;
  notify_at_90?: boolean;
  notify_at_100?: boolean;
  notify_user_ids?: string[];
  is_active?: boolean;
}
