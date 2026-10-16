import type {
  MaterialTarget,
  MaterialTargetList,
  MaterialTargetPayload,
} from "@/interfaces/material-target";
import { api, toastSuccess } from "@/services/api-client";

/** 材料目标 (I18). Endpoints in `receiving/target_views.py`. */
export const getMaterialTargets = (query: { project?: string; target?: string; category?: string } = {}) =>
  api.get<MaterialTargetList>(
    "/api/material-targets/get_targets/",
    Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value))),
  );

export async function createMaterialTarget(payload: MaterialTargetPayload) {
  const row = await api.post<MaterialTarget>("/api/material-targets/create_target/", payload);
  toastSuccess("materialTargets.toast.saved");
  return row;
}

export async function updateMaterialTarget(
  id: string,
  payload: Partial<Pick<MaterialTargetPayload, "target_quantity" | "alert_percentages" | "note">>,
) {
  const row = await api.post<MaterialTarget>(`/api/material-targets/${id}/update_target/`, payload);
  toastSuccess("materialTargets.toast.saved");
  return row;
}

export async function deleteMaterialTarget(id: string) {
  await api.delete(`/api/material-targets/${id}/delete_target/`);
  toastSuccess("materialTargets.toast.removed");
}
