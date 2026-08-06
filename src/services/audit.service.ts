/** Reading the audit trail. There is no write path: entries are append-only. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { AuditLogEntry } from "@/interfaces/audit";
import { api, download } from "@/services/api-client";

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

export function exportAuditLogs(input: {
  format: "PDF" | "EXCEL";
  title: string;
  subtitle: string;
  empty_label: string;
  columns: Array<{ key: string; label: string }>;
  [key: string]: unknown;
}): Promise<void> {
  return download("/api/audit-logs/export_audit_logs/", {
    method: "POST",
    body: input,
    fallbackFilename: input.format === "PDF" ? "audit-log.pdf" : "audit-log.xlsx",
  });
}
