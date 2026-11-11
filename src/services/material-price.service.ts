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
  if (saved.filled > 0) toastSuccess("materialPrices.toast.filled", { count: saved.filled });
  else toastSuccess("materialPrices.toast.saved");
  return saved;
}
