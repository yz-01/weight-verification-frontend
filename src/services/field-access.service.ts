import type { Branding, LoginResponse } from "@/interfaces/auth";
import { clearActiveProjectId } from "@/lib/project-context";
import {
  markFieldAppContext,
  setFieldTokens,
  setLocaleCookie,
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
  branding: Branding;
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
  /** Older deployed backends can authenticate without returning this hand-off token. */
  pwa_bootstrap?: {
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
    { silent: true },
  );
}

export function reissueFieldInvitation(
  userId: string,
  projectIds?: string[],
): Promise<FieldInvitationResult> {
  return api.post<FieldInvitationResult>(
    `/api/field-access/${userId}/reissue_invitation/`,
    projectIds ? { project_ids: projectIds } : {},
    { silent: true },
  );
}

export function getFieldAccessInfo(userId: string): Promise<FieldInvitationInfo> {
  return api.get<FieldInvitationInfo>(
    `/api/field-access/${userId}/access_info/`,
  );
}

export function createFieldPwaBootstrap(): Promise<
  NonNullable<FieldLoginResponse["pwa_bootstrap"]>
> {
  return api.post<NonNullable<FieldLoginResponse["pwa_bootstrap"]>>(
    "/api/field-access/create_pwa_bootstrap/",
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
  phone?: string;
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
  setFieldTokens(result.tokens);
  markFieldAppContext();
  setLocaleCookie(result.user.language);
}

const DEVICE_ID_KEY = "mse_field_device_id";

/**
 * Held for this page only, when the browser will not keep anything.
 *
 * A device id that is minted fresh on every visit can never match the binding
 * the server holds, so the PIN screen refuses forever with "this device is not
 * linked" - which is true, and gives no hint that the reason is the browser
 * throwing the identity away rather than anything the worker did.
 */
let sessionDeviceId = "";
let deviceIdIsPersistent = true;

function mintDeviceId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
}

export function getOrCreateFieldDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      deviceIdIsPersistent = true;
      return existing;
    }
    const id = sessionDeviceId || mintDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    // Written and read back: some browsers accept the write and discard it,
    // which looks like success and fails on the next visit instead.
    deviceIdIsPersistent =
      window.localStorage.getItem(DEVICE_ID_KEY) === id;
    sessionDeviceId = id;
    return id;
  } catch {
    // Site data blocked entirely. Throwing here would take the whole sign-in
    // down with a generic failure; the screen can say what is actually wrong
    // if it is handed an id and told the id will not survive.
    deviceIdIsPersistent = false;
    sessionDeviceId = sessionDeviceId || mintDeviceId();
    return sessionDeviceId;
  }
}

/**
 * Whether this phone can stay linked between visits.
 *
 * Only meaningful after ``getOrCreateFieldDeviceId`` has run, which is what
 * discovers it - there is no way to ask a browser this question without
 * writing something and reading it back.
 */
export function fieldDeviceIdIsPersistent(): boolean {
  return deviceIdIsPersistent;
}
