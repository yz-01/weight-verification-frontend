import type {
  MaterialTarget,
  MaterialTargetChange,
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

/** The lines and the note; the figure is only raised, by `appendMaterialTarget` (JB26). */
export async function updateMaterialTarget(
  id: string,
  payload: Partial<Pick<MaterialTargetPayload, "alert_percentages" | "note">>,
) {
  const row = await api.post<MaterialTarget>(`/api/material-targets/${id}/update_target/`, payload);
  toastSuccess("materialTargets.toast.saved");
  return row;
}

export async function deleteMaterialTarget(id: string) {
  await api.delete(`/api/material-targets/${id}/delete_target/`);
  toastSuccess("materialTargets.toast.removed");
}

/** 「+200 Ton」 (JB26). Signed with the user's own PIN; the PIN dialog opens by itself. */
export async function appendMaterialTarget(id: string, quantity: string) {
  const row = await api.post<MaterialTarget>(`/api/material-targets/${id}/append_target/`, { quantity });
  toastSuccess("materialTargets.toast.appended");
  return row;
}

/** 修改目标数量's history, oldest first (JB26). */
export const getMaterialTargetHistory = (id: string) =>
  api.get<{ results: MaterialTargetChange[] }>(`/api/material-targets/${id}/get_history/`);
