/**
 * 材料目标 (I18, ID39-ID42). Endpoints in `receiving/target_views.py`.
 *
 * Figures are strings with three decimals, as every quantity the API sends.
 */

export type MaterialTargetStatus = "NORMAL" | "APPROACHING" | "REACHED" | "EXCEEDED";

export interface MaterialTarget {
  id: string;
  project: string;
  project_code: string;
  project_name: string;
  category: string;
  category_name: string;
  /** Null: the material as a whole, whatever its specification. */
  spec_category: string | null;
  spec_name: string | null;
  unit: string;
  unit_label: string | null;
  target_quantity: string;
  alert_percentages: number[];
  note: string;
  /** Deliveries not rejected. */
  received: string;
  rejected: string;
  /** Returns the office confirmed (COMPLETED). */
  returned: string;
  /** 累计净进场: received less returned. */
  net: string;
  remaining: string;
  exceeded: string;
  percent: number | null;
  status: MaterialTargetStatus;
  deliveries: number;
  /** 「单位不同，未计入」: loads of this material in another unit. */
  other_units: { unit: string; unit_label: string | null; received: string; deliveries: number }[];
  created_by_name: string;
  created_at: string;
  can_manage: boolean;
}

export interface MaterialTargetList {
  results: MaterialTarget[];
  can_manage: boolean;
}

export interface MaterialTargetPayload {
  project: string;
  category: string;
  spec_category?: string;
  unit?: string;
  target_quantity: string;
  alert_percentages: number[];
  note?: string;
}

/** Head office's line per project (ID42). */
export interface MaterialTargetSummary {
  targets: number;
  exceeded: number;
  reached: number;
  approaching: number;
}
