/**
 * MSE 查看权限 (JB220, 客户 11-18: 「MSE 管理人员及开发团队是否必须经过客户授权，
 * 才能进入客户后台查看其内部业务资料？」).
 *
 * The shapes of `/api/platform-access/…` and of what the platform's own lists
 * gain, as `wt/review/jb220-contract.md` writes them.
 */

/** 「允许 MSE 查看」 / 「允许 MSE 管理账号」. */
export type PlatformAccessKind = "VIEW_RECORDS" | "MANAGE_ACCOUNTS";

export const PLATFORM_ACCESS_KINDS: readonly PlatformAccessKind[] = ["VIEW_RECORDS", "MANAGE_ACCOUNTS"];

/** The durations offered when the server names none (contract: hours). */
export const DEFAULT_ACCESS_HOURS: Record<PlatformAccessKind, number[]> = {
  VIEW_RECORDS: [24, 168, 720],
  MANAGE_ACCOUNTS: [24, 168],
};

export interface PlatformAccessWindow {
  open: boolean;
  until: string | null;
  opened_at: string | null;
  opened_by_name: string | null;
  reason: string;
}

export interface PlatformAccountsWindow extends PlatformAccessWindow {
  /** No 公司管理员 has signed in yet: MSE may still set up accounts. */
  onboarding: boolean;
}

/** An external access link MSE issued for the company (read-only for the customer). */
export interface PlatformIssuedLink {
  id: string;
  name: string;
  project_name: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** An account an MSE staff member made in the company (contract §1.1, (d)). */
export interface MseAddedAccount {
  id: string;
  full_name: string;
  email: string;
  role_name: string | null;
  /** The role's code, so a seeded role is named in the reader's language. */
  role_code?: string | null;
  status: string;
  /** `owner`: the first 公司管理员, made with the company at onboarding. */
  kind: "owner" | "added";
  added_at: string;
  added_by_name: string | null;
  last_login_at: string | null;
}

export interface PlatformAccessStatus {
  company: string;
  company_name: string;
  view: PlatformAccessWindow;
  accounts: PlatformAccountsWindow;
  durations: Partial<Record<PlatformAccessKind, number[]>>;
  /** Only the company's own 公司管理员; MSE always false. */
  can_change: boolean;
  /** List 1 「MSE 一直看得到」 - fixed keys, worded by the frontend. */
  always_visible: string[];
  /** List 2 「您按「允许 MSE 查看」后，MSE 才看得到」. */
  visible_when_open: string[];
  /** List 3 「MSE 一直看不到（就算您开放了查看）」. */
  never_visible: string[];
  /** 「MSE 加的账号」, oldest first. */
  mse_added_accounts?: MseAddedAccount[];
  external_links: PlatformIssuedLink[];
}

export type PlatformAccessOutcome =
  | "OPENED"
  | "REFUSED"
  | "ACCOUNT_CHANGED"
  | "REQUESTED"
  | "GRANT_OPENED"
  | "GRANT_CLOSED";

export const PLATFORM_ACCESS_OUTCOMES: readonly PlatformAccessOutcome[] = [
  "OPENED",
  "REFUSED",
  "ACCOUNT_CHANGED",
  "REQUESTED",
  "GRANT_OPENED",
  "GRANT_CLOSED",
];

/** One row of 「MSE 查看记录」. */
export interface PlatformAccessRecord {
  id: string;
  occurred_at: string;
  company: string;
  company_name: string;
  actor_name: string;
  actor_email: string;
  actor_is_mse: boolean;
  outcome: PlatformAccessOutcome;
  kind: "LIST" | "RECORD" | "FILE" | "ACCOUNT" | "GRANT" | "REQUEST" | string;
  module: string;
  record_id: string;
  record_label: string;
  /** ACCOUNT_CHANGED: the operation key; GRANT_* / REQUESTED: the kind; REFUSED: `closed` / `accounts_closed`. */
  detail: string;
}

export interface PlatformAccessRecordQuery {
  company?: string;
  outcome?: PlatformAccessOutcome;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

/** What `companies/get_companies` and `get_company` gain for MSE callers. */
export interface CompanyPlatformAccess {
  view_until: string | null;
  accounts_until: string | null;
  accounts_onboarding: boolean;
  can_create_external_link: boolean;
}

/** A row an MSE caller receives from a mixed list: `true` when fields were withheld. */
export interface PlatformMaskable {
  platform_closed?: boolean;
}
