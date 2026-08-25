/** Sign in, sign out, and the caller's own account. */

import { api, toastSuccess } from "@/services/api-client";
import type { Locale } from "@/i18n/config";
import type {
  CurrentUser,
  EmailCopy,
  LoginResponse,
  PermissionEntry,
  Portal,
} from "@/interfaces/auth";
import {
  clearTokens,
  getRefreshToken,
  setDriverTokens,
  setLocaleCookie,
  setSessionPortal,
  setTokens,
} from "@/lib/auth-token";
import {
  clearActiveProjectId,
  setActiveProjectId,
} from "@/lib/project-context";

export async function login(
  email: string,
  password: string,
  portal?: Portal,
): Promise<LoginResponse> {
  clearActiveProjectId();
  // Silent: the login form renders the failure inline rather than as a toast,
  // because the user is already looking at the field that is wrong.
  const data = await api.post<LoginResponse>(
    "/api/auth/login/",
    { email, password, ...(portal ? { portal } : {}) },
    { silent: true },
  );
  const permissions = new Set(data.user.permissions ?? []);
  const isDriver =
    data.user.portal === "MSE_SCRAP" &&
    !data.user.is_superuser &&
    permissions.has("task.view") &&
    permissions.has("task.submit") &&
    !permissions.has("task.assign");
  if (isDriver) setDriverTokens(data.tokens);
  else setTokens(data.tokens);
  setSessionPortal(data.user.portal);
  setLocaleCookie(data.user.language);
  if (data.user.account_type === "CONSULTANT") {
    const firstProject = data.user.consultant_projects.find(
      (project) => project.is_current,
    );
    if (firstProject) {
      setActiveProjectId(firstProject.project_id);
      data.user = await getMe();
    }
  }
  return data;
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    await api.post("/api/auth/logout/", { refresh }, { silent: true });
  } finally {
    // Clear locally even if the server call failed. The user asked to be
    // signed out and staying signed in would be the worse failure.
    clearTokens();
    clearActiveProjectId();
  }
}

export function getMe(): Promise<CurrentUser> {
  return api.get<CurrentUser>("/api/auth/get_me/", undefined, { silent: true });
}

export async function updateProfile(payload: {
  full_name?: string;
  phone?: string;
  language?: Locale;
  timezone?: string;
}): Promise<CurrentUser> {
  const user = await api.patch<CurrentUser>("/api/auth/update_profile/", payload);
  if (payload.language) setLocaleCookie(payload.language);
  toastSuccess("profile.toast.updated");
  return user;
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  await api.post("/api/auth/change_password/", payload);
  toastSuccess("auth.changePassword.success");
}

export async function forgotPassword(
  email: string,
  emailCopy?: EmailCopy,
  portal?: Portal,
): Promise<void> {
  await api.post(
    "/api/auth/forgot_password/",
    {
      email,
      ...(emailCopy ? { email_copy: emailCopy } : {}),
      ...(portal ? { portal } : {}),
    },
    { silent: true },
  );
}

export async function resetPassword(payload: {
  token: string;
  new_password: string;
  portal?: Portal;
}): Promise<void> {
  await api.post("/api/auth/reset_password/", payload, { silent: true });
}

export async function getPermissionCatalogue(): Promise<PermissionEntry[]> {
  const data = await api.get<{ permissions: PermissionEntry[] }>(
    "/api/auth/get_permission_catalogue/",
  );
  return data.permissions;
}
