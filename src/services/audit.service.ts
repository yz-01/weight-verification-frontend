/** Reading the audit trail. There is no write path: entries are append-only. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { AuditLogEntry } from "@/interfaces/audit";
import { api } from "@/services/api-client";

export function getAuditLogs(
  query: ListQuery,
): Promise<Paginated<AuditLogEntry>> {
  return api.list<AuditLogEntry>("/api/audit-logs/get_audit_logs/", query);
}

export function getAuditLog(id: string): Promise<AuditLogEntry> {
  return api.get<AuditLogEntry>(`/api/audit-logs/${id}/get_audit_log/`);
}

/** Every entry touching one record, for the history panel on a detail page. */
export function getObjectHistory(
  objectType: string,
  objectId: string,
): Promise<{ results: AuditLogEntry[]; count: number }> {
  return api.get<{ results: AuditLogEntry[]; count: number }>(
    "/api/audit-logs/get_object_history/",
    { object_type: objectType, object_id: objectId },
  );
}
