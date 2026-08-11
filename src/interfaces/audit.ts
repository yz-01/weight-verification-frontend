/** The audit trail. */

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "RESTORE"
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "PASSWORD_CHANGE"
  | "PERMISSION_CHANGE"
  | "BILLING_CHANGE"
  | "EXPORT"
  | "IMPERSONATE"
  | "MAINTENANCE"
  | "LOCK"
  | "VIEW"
  | "SEARCH";

/** `{field: {before, after}}`, holding only the fields that actually moved. */
export type AuditChanges = Record<
  string,
  {
    before: string | number | boolean | null;
    after: string | number | boolean | null;
  }
>;

export interface AuditLogEntry {
  id: string;
  result: "SUCCESS" | "FAILED";
  actor: string | null;
  actor_name: string | null;
  actor_email: string;
  impersonated_by: string | null;
  impersonated_by_name: string | null;
  company: string | null;
  company_name: string | null;
  action: AuditAction;
  object_type: string;
  object_id: string;
  object_repr: string;
  changes: AuditChanges;
  reason: string;
  context: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string;
  request_path: string;
  request_method: string;
  created_at: string;
}

export interface AuditSummary {
  total: number;
  by_action: Record<string, number>;
  by_object_type: Record<string, number>;
  top_actors: Array<{ actor_email: string; n: number }>;
  oldest_entry_at: string | null;
  newest_entry_at: string | null;
  retention: "PERMANENT";
  updates_allowed: false;
  deletes_allowed: false;
}
