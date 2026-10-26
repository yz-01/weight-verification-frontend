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
  /**
   * The original figure, then each addition (JB26), oldest first. The net
   * fills them in that order; above the last is `exceeded`.
   */
  tranches: MaterialTargetTranche[];
  deliveries: number;
  /** 「单位不同，未计入」: loads of this material in another unit. */
  other_units: { unit: string; unit_label: string | null; received: string; deliveries: number }[];
  created_by_name: string;
  created_at: string;
  can_manage: boolean;
}

export type MaterialTargetChangeKind = "ORIGINAL" | "ADDED";

/** One line of a target in the table (JB26): the original or one addition. */
export interface MaterialTargetTranche {
  kind: MaterialTargetChangeKind;
  quantity: string;
  /** The target up to and including this line. */
  cumulative_target: string;
  filled: string;
  remaining: string;
  percent: number | null;
  created_at: string;
  actor_name: string;
}

/**
 * One line of 修改目标数量's history (JB26). Written by the server from the
 * account whose PIN signed it; never changed or removed.
 */
export interface MaterialTargetChange {
  id: string;
  kind: MaterialTargetChangeKind;
  /** The original figure, or the amount added. */
  quantity: string;
  target_before: string;
  target_after: string;
  actor_name: string;
  actor_account: string;
  created_at: string;
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
