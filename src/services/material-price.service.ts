import type {
  MaterialPriceChange,
  MaterialPriceList,
  MaterialPriceSaved,
} from "@/interfaces/material-price";
import { api, toastSuccess } from "@/services/api-client";

/** 材料单价 (JB167). Endpoints in `receiving/price_views.py`. */
export const getMaterialPrices = (category: string) =>
  api.get<MaterialPriceList>("/api/material-prices/get_prices/", { category });

/** 价格历史, newest first. */
export const getMaterialPriceHistory = (category: string) =>
  api.get<{ category: string; name: string; results: MaterialPriceChange[] }>(
    "/api/material-prices/get_history/",
    { category },
  );

/** 设定单价 / 调整单价. Signed with the user's own PIN; the PIN dialog opens by itself. */
export async function setMaterialPrice(payload: {
  category: string;
  unit_price: string;
  effective_from: string;
}) {
  const saved = await api.post<MaterialPriceSaved>("/api/material-prices/set_price/", payload);
  const [key, values] = priceSavedToast(saved);
  toastSuccess(key, values);
  return saved;
}

/**
 * What the save says (JB171): the deliveries and - since JB171 - the 材料领用
 * it gave a price: 「补上了 N 条没有单价的进场记录、M 项材料领用」. With no issue
 * filled in, the words are JB167's as before.
 */
export function priceSavedToast(
  saved: Pick<MaterialPriceSaved, "filled" | "filled_issue_lines">,
): [string, Record<string, number> | undefined] {
  const issues = saved.filled_issue_lines ?? 0;
  if (issues > 0) return ["materialPrices.toast.filledWithIssues", { count: saved.filled, issues }];
  if (saved.filled > 0) return ["materialPrices.toast.filled", { count: saved.filled }];
  return ["materialPrices.toast.saved", undefined];
}
