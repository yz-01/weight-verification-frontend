/** Driver sign-in links: the office sends one, the driver's phone opens it. */

import type { LoginResponse } from "@/interfaces/auth";
import type {
  Driver,
  DriverLinkIssuePayload,
  DriverLinkIssued,
} from "@/interfaces/recycler";
import {
  markDriverAppContext,
  setDriverTokens,
  setLocaleCookie,
  setSessionPortal,
} from "@/lib/auth-token";
import { clearActiveProjectId } from "@/lib/project-context";
import { api, toastSuccess } from "@/services/api-client";

/** 「发送登录链接」. Sending again closes the driver's previous link. */
export function sendDriverLoginLink(
  driverId: string,
  payload: DriverLinkIssuePayload = {},
): Promise<DriverLinkIssued> {
  return api.post<DriverLinkIssued>(
    `/api/drivers/${driverId}/send_login_link/`,
    payload,
  );
}

/** Close the driver's link now; the phone signed in with it is signed out. */
export async function revokeDriverLoginLink(driverId: string): Promise<Driver> {
  const driver = await api.post<Driver>(
    `/api/drivers/${driverId}/revoke_login_link/`,
    {},
  );
  toastSuccess("drivers.loginLink.toast.revoked");
  return driver;
}

/**
 * Open a link on this phone: no email, no password, no PIN.
 *
 * Silent, because the link page has a screen of its own for every refusal -
 * a toast saying the same thing over it would be noise.
 */
export async function signInWithDriverLink(payload: {
  token: string;
  device_id: string;
  device_name?: string;
}): Promise<LoginResponse> {
  const result = await api.post<LoginResponse>(
    "/api/driver-link/sign_in/",
    payload,
    { silent: true, auth: false },
  );
  clearActiveProjectId();
  setDriverTokens(result.tokens);
  markDriverAppContext();
  setSessionPortal(result.user.portal);
  setLocaleCookie(result.user.language);
  return result;
}
