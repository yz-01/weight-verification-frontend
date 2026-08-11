import type { ListQuery } from "@/interfaces/api";
import type {
  CompanyBranch,
  ContractorCompanyProfile,
  ContractorSiteSettings,
  EmergencyPresence,
  SiteAccessEvent,
  SiteAccessPass,
  SiteAccessPassPayload,
  SiteGeofence,
  SiteGeofencePayload,
  SiteLocationPolicy,
} from "@/interfaces/site-access";
import { api, download, toastSuccess } from "@/services/api-client";

export const getSiteGeofences = (query: ListQuery = {}) =>
  api.list<SiteGeofence>("/api/site-geofences/get_geofences/", query);

export async function createSiteGeofence(payload: SiteGeofencePayload) {
  const row = await api.post<SiteGeofence>("/api/site-geofences/create_geofence/", payload);
  toastSuccess("siteControl.toast.geofenceSaved");
  return row;
}

export async function updateSiteGeofence(id: string, payload: Partial<SiteGeofencePayload>) {
  const row = await api.patch<SiteGeofence>(`/api/site-geofences/${id}/update_geofence/`, payload);
  toastSuccess("siteControl.toast.geofenceSaved");
  return row;
}

export async function deleteSiteGeofence(id: string) {
  await api.delete(`/api/site-geofences/${id}/delete_geofence/`);
  toastSuccess("siteControl.toast.geofenceRemoved");
}

export const getCompanyBranches = (query: ListQuery = {}) =>
  api.list<CompanyBranch>("/api/company-branches/get_branches/", query);

export async function createCompanyBranch(payload: Omit<CompanyBranch, "id" | "created_at" | "updated_at">) {
  const row = await api.post<CompanyBranch>("/api/company-branches/create_branch/", payload);
  toastSuccess("siteControl.toast.branchSaved");
  return row;
}

export async function updateCompanyBranch(id: string, payload: Partial<CompanyBranch>) {
  const row = await api.patch<CompanyBranch>(`/api/company-branches/${id}/update_branch/`, payload);
  toastSuccess("siteControl.toast.branchSaved");
  return row;
}

export async function deleteCompanyBranch(id: string) {
  await api.delete(`/api/company-branches/${id}/delete_branch/`);
  toastSuccess("siteControl.toast.branchRemoved");
}

export const getContractorSiteSettings = () =>
  api.get<ContractorSiteSettings>("/api/contractor-site-settings/get_settings/");

export const getContractorCompanyProfile = () =>
  api.get<ContractorCompanyProfile>(
    "/api/contractor-site-settings/get_company_profile/",
  );

export const getSiteLocationPolicy = () =>
  api.get<SiteLocationPolicy>("/api/contractor-site-settings/get_location_policy/");

export async function updateContractorSiteSettings(payload: Partial<ContractorSiteSettings>) {
  const row = await api.patch<ContractorSiteSettings>("/api/contractor-site-settings/update_settings/", payload);
  toastSuccess("siteControl.toast.settingsSaved");
  return row;
}

export async function updateContractorCompanyProfile(
  payload: Partial<ContractorCompanyProfile>,
  logo?: File | null,
) {
  const body = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (key === "logo" || value === undefined || value === null) return;
    body.append(key, String(value));
  });
  if (logo) body.append("logo", logo);
  const row = await api.patch<ContractorCompanyProfile>(
    "/api/contractor-site-settings/update_company_profile/",
    body,
  );
  toastSuccess("siteControl.toast.profileSaved");
  return row;
}

export const getSiteAccessPasses = (query: ListQuery = {}) =>
  api.list<SiteAccessPass>("/api/site-access-passes/get_passes/", query);

export const getSiteAccessPass = (id: string) =>
  api.get<SiteAccessPass>(`/api/site-access-passes/${id}/get_pass/`);

export async function createSiteAccessPass(payload: SiteAccessPassPayload) {
  const row = await api.post<SiteAccessPass>("/api/site-access-passes/create_pass/", payload);
  toastSuccess("siteControl.toast.passCreated");
  return row;
}

export async function reviewSiteAccessPass(id: string, decision: "APPROVED" | "REJECTED", note: string) {
  const row = await api.post<SiteAccessPass>(`/api/site-access-passes/${id}/review_pass/`, { decision, note });
  toastSuccess("siteControl.toast.passReviewed");
  return row;
}

export async function revokeSiteAccessPass(id: string, reason: string) {
  const row = await api.post<SiteAccessPass>(`/api/site-access-passes/${id}/revoke_pass/`, { reason });
  toastSuccess("siteControl.toast.passRevoked");
  return row;
}

export async function scanSiteAccessGate(payload: {
  qr_value: string;
  direction: "AUTO" | "ENTRY" | "EXIT";
  client_event_id: string;
  gate_name: string;
  latitude?: string;
  longitude?: string;
  photo?: File;
}) {
  const body = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) body.append(key, value);
  });
  const row = await api.post<{ pass: SiteAccessPass; event: SiteAccessEvent }>(
    "/api/site-access-passes/scan_gate/",
    body,
  );
  toastSuccess("siteControl.toast.gateRecorded");
  return row;
}

export const getEmergencyList = (project?: string) =>
  api.get<{ count: number; people: EmergencyPresence[] }>(
    "/api/site-access-passes/get_emergency_list/",
    project ? { project } : undefined,
  );

export const exportEmergencyList = (project?: string) =>
  download("/api/site-access-passes/export_emergency_list/", {
    method: "POST",
    body: {},
    query: project ? { project } : undefined,
    fallbackFilename: "emergency-list.xlsx",
  });
