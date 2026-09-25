import type { ListQuery, Paginated } from "@/interfaces/api";
import type { SundryClaim } from "@/interfaces/sundry-claim";
import { api, download, toastSuccess } from "@/services/api-client";
import { exportBody, exportQuery, type ExportRequest } from "@/services/contractor.service";

/** 杂费报销 (T-379). Endpoints in `contractor_ops/sundry_claims.py`. */
export const getSundryClaims = (query: ListQuery = {}): Promise<Paginated<SundryClaim>> =>
  api.list<SundryClaim>("/api/sundry-claims/get_claims/", query);

export const getSundryClaim = (id: string) =>
  api.get<SundryClaim>(`/api/sundry-claims/${id}/get_claim/`);

export async function createSundryClaim(payload: {
  project: string;
  amount: string;
  description: string;
  latitude?: string;
  longitude?: string;
  client_event_id?: string;
  attachments: File[];
}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (key === "attachments") continue;
    if (value !== undefined && value !== "") data.append(key, String(value));
  }
  payload.attachments.forEach((file) => data.append("attachments", file));
  const row = await api.post<SundryClaim>("/api/sundry-claims/create_claim/", data);
  toastSuccess("sundryClaim.toast.submitted");
  return row;
}

export async function reviewSundryClaim(id: string, decision: "CONFIRMED" | "REJECTED", note = "") {
  const row = await api.post<SundryClaim>(`/api/sundry-claims/${id}/review_claim/`, { decision, note });
  toastSuccess(decision === "CONFIRMED" ? "sundryClaim.toast.confirmed" : "sundryClaim.toast.rejected");
  return row;
}

/** Locked the moment it lands (D-231); a wrong one is answered by adding another. */
export async function addSundryPaymentProof(id: string, payload: { file: File; amount?: string; note?: string }) {
  const data = new FormData();
  data.append("file", payload.file);
  if (payload.amount) data.append("amount", payload.amount);
  if (payload.note) data.append("note", payload.note);
  const row = await api.post<SundryClaim>(`/api/sundry-claims/${id}/add_payment_proof/`, data);
  toastSuccess("sundryClaim.toast.proofAdded");
  return row;
}

export async function confirmSundryClaimPaid(id: string, note = "") {
  const row = await api.post<SundryClaim>(`/api/sundry-claims/${id}/confirm_paid/`, { note });
  toastSuccess("sundryClaim.toast.paid");
  return row;
}

export function exportSundryClaims(request: ExportRequest): Promise<void> {
  return download("/api/sundry-claims/export_claims/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `sundry-claims.${request.format}`,
  });
}
