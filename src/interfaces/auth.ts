/** Identity, roles and permissions. */

import type { Locale } from "@/i18n/config";
import type { CompanyType } from "@/interfaces/company";

export type UserStatus = "INVITED" | "ACTIVE" | "SUSPENDED";
export type AccountType = "PLATFORM" | "TENANT" | "CONSULTANT";

/**
 * Wording for a mailed link, resolved through i18n and handed to the backend.
 *
 * The backend owns the token and the sending; the frontend owns the words,
 * because the message catalogue lives here. Same split as the weigh ticket and
 * the spreadsheet exports. The body carries no link placeholder — the backend
 * appends the one-time link it alone can build.
 */
export interface EmailCopy {
  subject: string;
  body: string;
}

/**
 * Which slice of the permission catalogue a user can hold.
 *
 * Mirrors the backend registry. Platform staff sit outside the tenant
 * boundary; the other two are the tenant company types.
 */
export type Audience = "PLATFORM" | CompanyType;

/** The branded application entrance an account is allowed to use. */
export type Portal = "MSE_ADMIN" | "MSE_TRACE" | "MSE_SCRAP";

/** Project capacity is meaningful only for contractor companies. */
export interface ProjectQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface Branding {
  name: string;
  short_name: string;
  company_id: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  platform_icon_url: string | null;
  icon_url: string | null;
  revision: string | null;
  uses_platform_default: boolean;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

/**
 * The signed-in user.
 *
 * Carries the resolved permission list and the company type so the shell can
 * render its sidebar and guard its routes without a second request.
 */
export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  avatar: string | null;
  language: Locale;
  timezone: string;
  status: UserStatus;
  account_type: AccountType;
  mobile_access_only: boolean;
  is_field_staff: boolean;
  is_platform_staff: boolean;
  is_superuser: boolean;
  role: string | null;
  role_name: string | null;
  company: string | null;
  company_name: string | null;
  company_type: CompanyType | null;
  company_status: string | null;
  audience: Audience;
  portal: Portal;
  permissions: string[];
  features: string[];
  project_quota: ProjectQuota | null;
  consultant_projects: ConsultantProjectAccess[];
  active_project: ActiveProject | null;
  company_preferences: CompanyPreferences | null;
  branding: Branding;
}

export interface CompanyPreferences {
  date_format: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  time_format: "12H" | "24H";
  language: Locale;
  timezone: string;
  home_page: "/dashboard" | "/projects" | "/notifications" | "/field-staff";
  default_notification_channel: "IN_APP" | "PUSH";
}

export interface ConsultantProjectAccess {
  grant_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  company_id: string;
  company_name: string;
  organization_name: string;
  permissions: string[];
  valid_from: string;
  valid_until: string | null;
  is_current: boolean;
}

export interface ActiveProject {
  project_id: string;
  project_name: string;
  company_id: string;
  company_name: string;
}

export interface LoginResponse {
  tokens: TokenPair;
  user: CurrentUser;
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  status: UserStatus;
  role: string | null;
  role_name: string | null;
  company: string | null;
  company_name: string | null;
  company_type: CompanyType | null;
  is_platform_staff: boolean;
  mobile_access_only: boolean;
  is_field_staff: boolean;
  language: Locale;
  last_login_at: string | null;
  created_at: string;
}

export interface UserDetail extends UserRow {
  avatar: string | null;
  timezone: string;
  last_login_ip: string | null;
  updated_at: string;
}

export interface UserStats {
  total: number;
  by_status: Partial<Record<UserStatus, number>>;
  by_audience: Partial<Record<Audience, number>>;
  active: number;
  suspended: number;
  invited: number;
  online: number;
}

export interface UserPayload {
  email: string;
  full_name: string;
  phone?: string;
  role?: string | null;
  language?: Locale;
  timezone?: string;
}

export interface UserReplacementPayload {
  incoming_user?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  reason: string;
  transfer_role: boolean;
  transfer_projects: boolean;
  transfer_responsibilities: boolean;
  transfer_open_tasks: boolean;
}

export interface UserReplacement {
  id: string;
  company: string;
  company_name: string;
  outgoing_user: string;
  outgoing_user_name: string;
  outgoing_user_email: string;
  incoming_user: string;
  incoming_user_name: string;
  incoming_user_email: string;
  reason: string;
  outgoing_snapshot: Record<string, unknown>;
  incoming_snapshot: Record<string, unknown>;
  transfer_summary: {
    role_transferred?: boolean;
    project_ids?: string[];
    responsibility_ids?: string[];
    task_ids?: string[];
  };
  invitation_sent: boolean;
  completed_at: string;
  created_by: string | null;
  completed_by_name: string | null;
}

export interface Role {
  id: string;
  company: string | null;
  code: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  user_count?: number;
  created_at: string;
  updated_at: string;
}

export interface RolePayload {
  code: string;
  name: string;
  description?: string;
  permissions: string[];
}

/** One row of the permission matrix, as the registry defines it. */
export interface PermissionEntry {
  group: string;
  code: string;
  audiences: Audience[];
}

export type LoginOutcome =
  "SUCCESS" | "BAD_CREDENTIALS" | "USER_SUSPENDED" | "COMPANY_SUSPENDED";

export interface LoginRecord {
  id: string;
  user: string | null;
  user_name: string | null;
  email_attempted: string;
  company: string | null;
  outcome: LoginOutcome;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
}
