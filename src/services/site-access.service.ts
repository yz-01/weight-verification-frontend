import type { ListQuery } from "@/interfaces/api";
import type {
  CompanyBranch,
  ContractorCompanyProfile,
  ContractorSiteSettings,
  EmergencyList,
  GateIncident,
  GateIncidentDetail,
  GateIncidentPayload,
  GateMemberOption,
  GatePassCheck,
  GatePassDetail,
  GatePhotoDraft,
  GateSummary,
  SiteAccessCredential,
  SiteAccessCredentialPayload,
  SiteAccessEvent,
  SiteAccessPass,
  SiteAccessPassPayload,
  SiteGeofence,
  SiteGeofencePayload,
  SiteLocationPolicy,
  ThirdPartyAccessEvent,
  VisitorRecord,
} from "@/interfaces/site-access";
import type { CompanyBankAccount, CompanyBankAccountPayload } from "@/interfaces/company";
import { api, download, toastSuccess } from "@/services/api-client";
import {
  exportBody,
  exportQuery,
  type ExportRequest,
} from "@/services/contractor.service";

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
  /** The company's own background (C12), shown behind its pages. */
  backgroundImage?: File | null,
) {
  const body = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (key === "logo" || key === "background_image" || value === undefined || value === null) return;
    body.append(key, String(value));
  });
  if (logo) body.append("logo", logo);
  if (backgroundImage) body.append("background_image", backgroundImage);
  const row = await api.patch<ContractorCompanyProfile>(
    "/api/contractor-site-settings/update_company_profile/",
    body,
  );
  toastSuccess("siteControl.toast.profileSaved");
  return row;
}

export const getOwnCompanyBankAccounts = () =>
  api.list<CompanyBankAccount>(
    "/api/contractor-site-settings/get_bank_accounts/",
    { page_size: 100 },
  );

export const createOwnCompanyBankAccount = (payload: CompanyBankAccountPayload) =>
  api.post<CompanyBankAccount>(
    "/api/contractor-site-settings/create_bank_account/",
    payload,
  );

export const updateOwnCompanyBankAccount = (
  id: string,
  payload: Partial<CompanyBankAccountPayload> & { is_active?: boolean },
) =>
  api.patch<CompanyBankAccount>(
    `/api/contractor-site-settings/${id}/update_bank_account/`,
    payload,
  );

export const setOwnPrimaryBankAccount = (id: string) =>
  api.post<CompanyBankAccount>(
    `/api/contractor-site-settings/${id}/set_primary_bank_account/`,
  );

export const deleteOwnCompanyBankAccount = (id: string) =>
  api.delete(`/api/contractor-site-settings/${id}/delete_bank_account/`);

export const getSiteAccessPasses = (query: ListQuery = {}) =>
  api.list<SiteAccessPass>("/api/site-access-passes/get_passes/", query);

export const getSiteAccessDefaults = () =>
  api.get<{ visitor_pass_hours: number }>(
    "/api/site-access-passes/get_defaults/",
  );

export const getSiteAccessPass = (id: string) =>
  api.get<SiteAccessPass>(`/api/site-access-passes/${id}/get_pass/`);

export async function createSiteAccessPass(payload: SiteAccessPassPayload) {
  const row = await api.post<SiteAccessPass>("/api/site-access-passes/create_pass/", payload);
  toastSuccess("siteControl.toast.passCreated");
  return row;
}

/**
 * Correct a pass before anyone reviews it.
 *
 * The backend refuses this once a pass leaves PENDING, and refuses moving a
 * pass to a different project, so the screen only offers it on a pending pass
 * and keeps the project fixed.
 */
export async function updateSiteAccessPass(
  id: string,
  payload: Partial<SiteAccessPassPayload>,
) {
  const row = await api.patch<SiteAccessPass>(
    `/api/site-access-passes/${id}/update_pass/`,
    payload,
  );
  toastSuccess("siteControl.toast.passUpdated");
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

/**
 * Credentials the gate hardware will present for this pass.
 *
 * Until one is registered, a card reader or plate camera has nothing to match
 * against and the gate answers every scan with "unknown credential" — so this
 * screen is what makes the hardware lane usable at all.
 */
export const getSiteAccessCredentials = (passId: string) =>
  api.get<SiteAccessCredential[]>(
    `/api/site-access-passes/${passId}/get_credentials/`,
  );

export async function registerSiteAccessCredential(
  passId: string,
  payload: SiteAccessCredentialPayload,
) {
  const row = await api.post<SiteAccessCredential>(
    `/api/site-access-passes/${passId}/register_credential/`,
    payload,
  );
  toastSuccess("siteControl.toast.credentialRegistered");
  return row;
}

export async function revokeSiteAccessCredential(
  passId: string,
  credentialId: string,
  reason: string,
) {
  const row = await api.post<SiteAccessCredential>(
    `/api/site-access-passes/${passId}/revoke_credential/`,
    { credential: credentialId, reason },
  );
  toastSuccess("siteControl.toast.credentialRevoked");
  return row;
}

/**
 * Read a scanned pass at this project's gate (HD7): the whole pass, and
 * whether it may come in or go out here - or why not. Records nothing.
 * Silent: the refusal is said on the screen, not in a toast.
 */
export const checkGatePass = (project: string, qrValue: string) =>
  api.post<GatePassCheck>(
    "/api/site-access-passes/check_gate_pass/",
    { project, qr_value: qrValue },
    { silent: true },
  );

/** Confirm Entry / Confirm Exit after reading the pass (HD7). */
export async function confirmGatePass(payload: {
  project: string;
  qr_value: string;
  direction: "ENTRY" | "EXIT";
  client_event_id: string;
  gate_name?: string;
  latitude?: string;
  longitude?: string;
}) {
  const row = await api.post<{ pass: GatePassDetail; event: SiteAccessEvent }>(
    "/api/site-access-passes/confirm_gate_pass/",
    payload,
  );
  toastSuccess("siteControl.toast.gateRecorded");
  return row;
}

export const getEmergencyList = (project?: string) =>
  api.get<EmergencyList>(
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

export const getThirdPartyAccessEvents = (query: ListQuery = {}) =>
  api.list<ThirdPartyAccessEvent>(
    "/api/site-access-passes/get_third_party_events/",
    query,
  );

export const getGateIncidents = (query: ListQuery = {}) =>
  api.list<GateIncident>("/api/gate-incidents/get_gate_incidents/", query);

export const getGateIncident = (id: string) =>
  api.get<GateIncidentDetail>(`/api/gate-incidents/${id}/get_gate_incident/`);

export const getGateMemberOptions = (project: string) =>
  api.get<GateMemberOption[]>("/api/gate-incidents/get_member_options/", {
    project,
  });

/** Gate Records (HD9) as a spreadsheet or PDF, each row with its photos. */
export function exportGateIncidents(request: ExportRequest): Promise<void> {
  return download("/api/gate-incidents/export_gate_incidents/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `gate-records.${request.format}`,
  });
}

/** The dashboards' 门岗 card (HD10). */
export const getGateSummary = (project?: string) =>
  api.get<GateSummary>(
    "/api/gate-incidents/get_gate_summary/",
    project ? { project } : undefined,
  );

/** Visitor Records (HD9): every confirmed entry and exit. */
export const getVisitorRecords = (query: ListQuery = {}) =>
  api.list<VisitorRecord>("/api/visitor-records/get_visitor_records/", query);

export function exportVisitorRecords(request: ExportRequest): Promise<void> {
  return download("/api/visitor-records/export_visitor_records/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `visitor-records.${request.format}`,
  });
}

/**
 * 「确认结束」 on a Gate Issue (HD6): the shared record closure, which the
 * server allows only to the people asked in or a site-access manager.
 */
export async function closeGateIssue(id: string, note: string) {
  const row = await api.post<unknown>("/api/record-closure/confirm_record/", {
    kind: "GATE_INCIDENT",
    record: id,
    note,
  });
  toastSuccess("siteControl.toast.gateIssueClosed");
  return row;
}

function appendGatePhotos(body: FormData, photos: GatePhotoDraft[]) {
  photos.forEach((photo) => body.append("photos", photo.file));
  body.append(
    "photo_meta",
    JSON.stringify(
      photos.map(({ captured_at, latitude, longitude, accuracy_m, client_event_id }) => ({
        captured_at,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        accuracy_m: accuracy_m ?? null,
        client_event_id,
      })),
    ),
  );
}

/**
 * One gate record (HD5): a plain photo (one photo), or a Gate Issue with its
 * photos, the guard's note and the people asked in.
 */
export async function createGateIncident(payload: GateIncidentPayload) {
  const body = new FormData();
  const { photos, members, is_issue, ...fields } = payload;
  body.append("is_issue", is_issue ? "true" : "false");
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== "") body.append(key, value);
  });
  members.forEach((member) => body.append("members", member));
  appendGatePhotos(body, photos);
  const row = await api.post<GateIncidentDetail>(
    "/api/gate-incidents/create_gate_incident/",
    body,
  );
  toastSuccess("siteControl.toast.gateIncidentSaved");
  return row;
}

export async function addGateIncidentPhotos(
  id: string,
  photos: GatePhotoDraft[],
  fix?: { latitude: string; longitude: string; accuracy_m?: string },
) {
  const body = new FormData();
  appendGatePhotos(body, photos);
  if (fix) {
    body.append("latitude", fix.latitude);
    body.append("longitude", fix.longitude);
    if (fix.accuracy_m) body.append("accuracy_m", fix.accuracy_m);
  }
  const row = await api.post<GateIncidentDetail>(
    `/api/gate-incidents/${id}/add_photos/`,
    body,
  );
  toastSuccess("siteControl.toast.gatePhotosAdded");
  return row;
}

export async function addGateIncidentMembers(id: string, members: string[]) {
  const row = await api.post<GateIncidentDetail>(
    `/api/gate-incidents/${id}/add_members/`,
    { members },
  );
  toastSuccess("siteControl.toast.gateMembersAdded");
  return row;
}

/** 通行证 (H16, HD13): the rows the list shows, as Excel or PDF. */
export function exportSiteAccessPasses(request: ExportRequest): Promise<void> {
  return download("/api/site-access-passes/export_passes/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `access-passes.${request.format}`,
  });
}
