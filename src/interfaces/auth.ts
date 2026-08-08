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
  | "SUCCESS"
  | "BAD_CREDENTIALS"
  | "USER_SUSPENDED"
  | "COMPANY_SUSPENDED";

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
