import type { ListQuery } from "@/interfaces/api";
import type {
  BusinessTarget,
  BusinessTargetPayload,
} from "@/interfaces/business-target";
import { api, toastSuccess } from "@/services/api-client";

export function getBusinessTargets(query: ListQuery = {}) {
  return api.list<BusinessTarget>("/api/business-targets/", query);
}

export async function createBusinessTarget(payload: BusinessTargetPayload) {
  const row = await api.post<BusinessTarget>("/api/business-targets/", payload);
  toastSuccess("businessTargets.toast.created");
  return row;
}

export async function updateBusinessTarget(
  id: string,
  payload: Partial<BusinessTargetPayload>,
) {
  const row = await api.patch<BusinessTarget>(
    `/api/business-targets/${id}/`,
    payload,
  );
  toastSuccess("businessTargets.toast.updated");
  return row;
}

export async function deleteBusinessTarget(id: string) {
  await api.delete(`/api/business-targets/${id}/`);
  toastSuccess("businessTargets.toast.removed");
}

export async function refreshBusinessTarget(id: string) {
  const row = await api.post<BusinessTarget>(
    `/api/business-targets/${id}/refresh_progress/`,
  );
  toastSuccess("businessTargets.toast.refreshed");
  return row;
}

export function getActiveBusinessTargets(query: ListQuery = {}) {
  return api.list<BusinessTarget>("/api/business-targets/active/", query);
}
