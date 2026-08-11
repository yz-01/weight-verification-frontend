/** Users and roles inside a company, or the platform's own staff. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  EmailCopy,
  LoginRecord,
  Role,
  RolePayload,
  UserDetail,
  UserPayload,
  UserReplacement,
  UserReplacementPayload,
  UserRow,
  UserStats,
} from "@/interfaces/auth";
import { api, toastSuccess } from "@/services/api-client";

export function getUsers(query: ListQuery): Promise<Paginated<UserRow>> {
  return api.list<UserRow>("/api/users/get_users/", query);
}

export function getUser(id: string): Promise<UserDetail> {
  return api.get<UserDetail>(`/api/users/${id}/get_user/`);
}

export async function createUser(
  payload: UserPayload & { company?: string },
  emailCopy?: EmailCopy,
): Promise<UserDetail> {
  const user = await api.post<UserDetail>("/api/users/create_user/", {
    ...payload,
    ...(emailCopy ? { email_copy: emailCopy } : {}),
  });
  toastSuccess("users.toast.created");
  return user;
}

export async function updateUser(
  id: string,
  payload: Partial<UserPayload>,
): Promise<UserDetail> {
  const user = await api.patch<UserDetail>(
    `/api/users/${id}/update_user/`,
    payload,
  );
  toastSuccess("users.toast.updated");
  return user;
}

export async function updateUserStatus(
  id: string,
  payload: { status: "ACTIVE" | "SUSPENDED"; reason?: string },
): Promise<UserDetail> {
  const user = await api.post<UserDetail>(
    `/api/users/${id}/update_user_status/`,
    payload,
  );
  toastSuccess("users.toast.statusUpdated");
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/api/users/${id}/delete_user/`);
  toastSuccess("users.toast.removed");
}

export async function sendPasswordReset(
  id: string,
  emailCopy?: EmailCopy,
): Promise<void> {
  await api.post(
    `/api/users/${id}/send_password_reset/`,
    emailCopy ? { email_copy: emailCopy } : {},
  );
  toastSuccess("users.resetPassword.sent");
}

export async function forceLogoutUser(id: string): Promise<number> {
  const result = await api.post<{ sessions_revoked: number }>(
    `/api/users/${id}/force_logout/`,
  );
  toastSuccess("users.forceLogout.done");
  return result.sessions_revoked;
}

export function getUserStats(query: ListQuery = {}): Promise<UserStats> {
  return api.get<UserStats>("/api/users/get_user_stats/", query);
}

export function getUserReplacements(
  query: ListQuery = {},
): Promise<Paginated<UserReplacement>> {
  return api.list<UserReplacement>("/api/users/get_replacements/", query);
}

export async function replaceUser(
  outgoingUserId: string,
  payload: UserReplacementPayload,
): Promise<UserReplacement> {
  const replacement = await api.post<UserReplacement>(
    `/api/users/${outgoingUserId}/replace_user/`,
    payload,
  );
  toastSuccess("userHandover.toast.completed");
  return replacement;
}

export function getRoles(query: ListQuery): Promise<Paginated<Role>> {
  return api.list<Role>("/api/roles/get_roles/", query);
}

export function getRole(id: string): Promise<Role> {
  return api.get<Role>(`/api/roles/${id}/get_role/`);
}

export async function createRole(
  payload: RolePayload & { company?: string },
): Promise<Role> {
  const role = await api.post<Role>("/api/roles/create_role/", payload);
  toastSuccess("roles.toast.created");
  return role;
}

export async function updateRole(
  id: string,
  payload: Partial<RolePayload>,
): Promise<Role> {
  const role = await api.patch<Role>(`/api/roles/${id}/update_role/`, payload);
  toastSuccess("roles.toast.updated");
  return role;
}

export async function deleteRole(id: string): Promise<void> {
  await api.delete(`/api/roles/${id}/delete_role/`);
  toastSuccess("roles.toast.removed");
}

export function getLoginRecords(
  query: ListQuery,
): Promise<Paginated<LoginRecord>> {
  return api.list<LoginRecord>("/api/login-records/get_login_records/", query);
}
