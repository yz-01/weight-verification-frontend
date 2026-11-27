/** Users and roles inside a company, or the platform's own staff. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  Department,
  DepartmentPayload,
  EmailCopy,
  InviteOptions,
  InvitePayload,
  LoginRecord,
  PermissionSwitchPayload,
  PermissionSwitchState,
  Role,
  RolePayload,
  RoleTemplate,
  UserDetail,
  UserPayload,
  UserReplacement,
  UserReplacementPayload,
  UserRow,
  UserStats,
  WorkTrade,
  WorkTradePayload,
} from "@/interfaces/auth";
import { toast } from "sonner";

import { t } from "@/lib/i18n-runtime";
import { api, download, toastSuccess } from "@/services/api-client";
import { exportBody, exportQuery, type ExportRequest } from "@/services/contractor.service";

/**
 * The email did not go out (JB208-7, Lucas 11-16 audit).
 *
 * The server says so - `invitation_sent` / `delivered` is false when no mail
 * server is set or the send failed - and the screen used to say 「用户已邀请」 /
 * 「重设链接已发送」 regardless, so the new person never got a way in while
 * the admin believed the link was on its way. The same functions serve MSE
 * Admin and a tenant's own user pages, so the sentence names the button both
 * have (「发送重设链接」) and asks whoever runs the system to check the mail.
 * Amber and long enough to read; it is not a success.
 */
function warnNotSent(messageKey: string): void {
  toast.warning(t(messageKey), { duration: 15_000 });
}

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
  const user = await api.post<UserDetail & { invitation_sent?: boolean }>(
    "/api/users/create_user/",
    {
      ...payload,
      ...(emailCopy ? { email_copy: emailCopy } : {}),
    },
  );
  if (user.invitation_sent === false) warnNotSent("users.toast.createdNotSent");
  else toastSuccess("users.toast.created");
  return user;
}

/** 邀请用户 (JB242): projects, 常用权限 and the inviter's locked switches. */
export function getInviteOptions(company?: string): Promise<InviteOptions> {
  return api.get<InviteOptions>("/api/users/invite_options/", company ? { company } : undefined);
}

/**
 * 邀请用户 in one page (JB242): account, permissions, projects and the
 * invitation at once, with one sign-off PIN (the API client's dialog). A
 * refusal stores nothing.
 */
export async function inviteUser(
  payload: InvitePayload & { company?: string },
  emailCopy?: EmailCopy,
): Promise<UserDetail & { invitation_sent?: boolean }> {
  const user = await api.post<UserDetail & { invitation_sent?: boolean }>("/api/users/invite_user/", {
    ...payload,
    ...(emailCopy ? { email_copy: emailCopy } : {}),
  });
  if (user.invitation_sent === false) warnNotSent("users.toast.createdNotSent");
  else toastSuccess("jb242.sent", { email: user.email });
  return user;
}

export async function updateUser(
  id: string,
  payload: Partial<UserPayload>,
  options: { quiet?: boolean } = {},
): Promise<UserDetail> {
  const user = await api.patch<UserDetail>(
    `/api/users/${id}/update_user/`,
    payload,
  );
  // Quiet when the edit dialog saves the 权限开关 next: one toast at the end,
  // not 「用户已更新」 while the PIN for the switches is still being asked.
  if (!options.quiet) toastSuccess("users.toast.updated");
  return user;
}

/** 权限开关 (J17): what one back-office person may do, switch by switch. */
export function getPermissionSwitches(id: string): Promise<PermissionSwitchState> {
  return api.get<PermissionSwitchState>(`/api/users/${id}/get_permission_switches/`);
}

/** Saves the switches; the server asks for the editor's sign-off PIN. */
export async function setPermissionSwitches(
  id: string,
  payload: PermissionSwitchPayload,
  options: { quiet?: boolean } = {},
): Promise<PermissionSwitchState> {
  const state = await api.post<PermissionSwitchState>(
    `/api/users/${id}/set_permission_switches/`,
    payload,
  );
  if (!options.quiet) toastSuccess("users.toast.switchesSaved");
  return state;
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

export async function deleteUser(id: string, phone = false): Promise<void> {
  await api.delete(`/api/users/${id}/delete_user/`);
  // A phone account is deleted, its number freed (JB109).
  toastSuccess(phone ? "users.toast.fieldDeleted" : "users.toast.removed");
}

export async function sendPasswordReset(
  id: string,
  emailCopy?: EmailCopy,
): Promise<void> {
  const result = await api.post<{ delivered?: boolean } | undefined>(
    `/api/users/${id}/send_password_reset/`,
    emailCopy ? { email_copy: emailCopy } : {},
  );
  if (result?.delivered === false) warnNotSent("users.resetPassword.notSent");
  else toastSuccess("users.resetPassword.sent");
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

/** The preset roles this company does not have yet (「从预设新增」, I34). */
export async function getRoleTemplates(): Promise<RoleTemplate[]> {
  const data = await api.get<{ results: RoleTemplate[]; count: number }>(
    "/api/roles/get_role_templates/",
  );
  return data.results;
}

/** Add one preset role, exactly as a new company gets it. */
export async function createRoleFromTemplate(code: string): Promise<Role> {
  const role = await api.post<Role>("/api/roles/create_role_from_template/", { code });
  toastSuccess("roles.toast.presetAdded");
  return role;
}

export function getLoginRecords(
  query: ListQuery,
): Promise<Paginated<LoginRecord>> {
  return api.list<LoginRecord>("/api/login-records/get_login_records/", query);
}

/**
 * Departments.
 *
 * A department with no company is MSE Trace's own, the same rule that makes a
 * user platform staff. Platform asset transfers (superadmin 17.2.8) move
 * equipment between these, so without a way to create one the transfer picker
 * stays empty.
 */
export function getDepartments(
  query: ListQuery & { company?: string },
): Promise<Paginated<Department>> {
  return api.list<Department>("/api/departments/get_departments/", query);
}

export async function createDepartment(
  payload: DepartmentPayload,
): Promise<Department> {
  const row = await api.post<Department>(
    "/api/departments/create_department/",
    payload,
  );
  toastSuccess("departments.toast.created");
  return row;
}

export async function updateDepartment(
  id: string,
  payload: Partial<DepartmentPayload>,
): Promise<Department> {
  const row = await api.patch<Department>(
    `/api/departments/${id}/update_department/`,
    payload,
  );
  toastSuccess("departments.toast.updated");
  return row;
}

export async function deleteDepartment(id: string): Promise<void> {
  await api.delete(`/api/departments/${id}/delete_department/`);
  toastSuccess("departments.toast.removed");
}

/**
 * Work trades (requirement 15.2.3).
 *
 * A maintained list rather than free text on each worker, so the on-site
 * headcount breakdown the requirement asks for actually adds up: typed by hand
 * one trade becomes three spellings and the numbers stop agreeing.
 */
export function getWorkTrades(
  query: ListQuery = {},
): Promise<Paginated<WorkTrade>> {
  return api.list<WorkTrade>("/api/work-trades/get_trades/", query);
}

export async function createWorkTrade(
  payload: WorkTradePayload,
): Promise<WorkTrade> {
  const row = await api.post<WorkTrade>("/api/work-trades/create_trade/", payload);
  toastSuccess("organisation.toast.tradeCreated");
  return row;
}

export async function updateWorkTrade(
  id: string,
  payload: Partial<WorkTradePayload>,
): Promise<WorkTrade> {
  const row = await api.patch<WorkTrade>(
    `/api/work-trades/${id}/update_trade/`,
    payload,
  );
  toastSuccess("organisation.toast.tradeUpdated");
  return row;
}

export async function deleteWorkTrade(id: string): Promise<void> {
  await api.delete(`/api/work-trades/${id}/delete_trade/`);
  toastSuccess("organisation.toast.tradeRemoved");
}

/** 用户管理 (H16, HD13): the rows the list shows, as Excel or PDF. */
export function exportUsers(request: ExportRequest): Promise<void> {
  return download("/api/users/export_users/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `users.${request.format}`,
  });
}

/** 人员交接记录 (H16, HD13): the rows the list shows, as Excel or PDF. */
export function exportUserReplacements(request: ExportRequest): Promise<void> {
  return download("/api/users/export_replacements/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `user-handovers.${request.format}`,
  });
}

/** 登录记录 (H16, HD13): the rows the list shows, as Excel or PDF. */
export function exportLoginRecords(request: ExportRequest): Promise<void> {
  return download("/api/login-records/export_login_records/", {
    method: "POST",
    query: exportQuery(request),
    body: exportBody(request),
    fallbackFilename: `login-records.${request.format}`,
  });
}
