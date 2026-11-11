import type { MaterialPriceNow } from "@/interfaces/contractor-ops";

/** 材料单价 (JB167). Endpoints in `receiving/price_views.py`. */

/** A material or one of its specifications, as the 单价 dialog lists it. */
export interface MaterialPriceEntry {
  category: string;
  name: string;
  is_spec: boolean;
  unit: string;
  /** A unit the company added; empty for a built-in code (translated). */
  unit_label: string;
  /** False for 「其他」 / 「其他材料」: typed on each record, priced there. */
  priced_here: boolean;
  current: MaterialPriceNow | null;
  upcoming: MaterialPriceNow[];
}

export interface MaterialPriceList {
  material: string;
  results: MaterialPriceEntry[];
  /** The company's today, for the date box's default. */
  today: string;
  can_manage: boolean;
}

/** One line of 价格历史: 旧价格、新价格、修改人、修改时间、生效日期. */
export interface MaterialPriceChange {
  id: string;
  previous_price: string | null;
  unit_price: string;
  unit: string;
  effective_from: string;
  created_by_name: string;
  created_at: string;
}

export interface MaterialPriceSaved {
  price: MaterialPriceChange;
  /** Records that had no unit price and were given this one. */
  filled: number;
  entry: MaterialPriceEntry;
}
