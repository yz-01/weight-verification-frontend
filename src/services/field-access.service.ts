import type { LoginResponse } from "@/interfaces/auth";
import { clearActiveProjectId } from "@/lib/project-context";
import {
  setLocaleCookie,
  setSessionPortal,
  setTokens,
} from "@/lib/auth-token";
import { api } from "@/services/api-client";

export interface FieldInvitationInfo {
  user_id: string;
  full_name: string;
  phone: string;
  projects: Array<{ id: string; code: string; name: string }>;
  invitation_expires_at: string;
  pin_expires_at: string;
  activated_at: string | null;
}

export interface FieldInvitationResult extends FieldInvitationInfo {
  token: string;
  pin: string;
  activation_url: string;
}

export interface FieldInvitationPayload {
  user?: string;
  full_name?: string;
  phone: string;
  email?: string;
  project_ids: string[];
}

export interface FieldLoginResponse {
  tokens: LoginResponse["tokens"];
  user: LoginResponse["user"];
  pwa_bootstrap: {
    token: string;
    expires_at: string;
  };
}

export function createFieldInvitation(
  payload: FieldInvitationPayload,
): Promise<FieldInvitationResult> {
  return api.post<FieldInvitationResult>(
    "/api/field-access/create_invitation/",
    payload,
  );
}

export function reissueFieldInvitation(
  userId: string,
): Promise<FieldInvitationResult> {
  return api.post<FieldInvitationResult>(
    `/api/field-access/${userId}/reissue_invitation/`,
    {},
  );
}

export function resetFieldDevice(userId: string): Promise<void> {
  return api.post<void>(`/api/field-access/${userId}/reset_device/`, {});
}

export function inspectFieldInvitation(token: string): Promise<FieldInvitationInfo> {
  return api.get<FieldInvitationInfo>(
    "/api/field-access/inspect_invitation/",
    { token },
    { silent: true, auth: false },
  );
}

export async function activateFieldDevice(payload: {
  token: string;
  pin: string;
  device_id: string;
  device_name?: string;
}): Promise<FieldLoginResponse> {
  const result = await api.post<FieldLoginResponse>(
    "/api/field-access/activate/",
    payload,
    { silent: true, auth: false },
  );
  beginFieldSession(result);
  return result;
}

export async function fieldLogin(payload: {
  phone: string;
  pin: string;
  device_id: string;
}): Promise<FieldLoginResponse> {
  const result = await api.post<FieldLoginResponse>(
    "/api/field-access/field_login/",
    payload,
    { silent: true, auth: false },
  );
  beginFieldSession(result);
  return result;
}

export async function restoreFieldPwaSession(payload: {
  token: string;
  device_id: string;
  device_name?: string;
}): Promise<LoginResponse> {
  const result = await api.post<LoginResponse>(
    "/api/field-access/pwa_bootstrap/",
    payload,
    { silent: true, auth: false },
  );
  beginFieldSession(result);
  return result;
}

function beginFieldSession(result: LoginResponse): void {
  clearActiveProjectId();
  setTokens(result.tokens);
  setSessionPortal("MSE_TRACE");
  setLocaleCookie(result.user.language);
}

const DEVICE_ID_KEY = "mse_field_device_id";

export function getOrCreateFieldDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
