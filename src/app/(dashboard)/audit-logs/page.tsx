"use client";

import { AdminModuleLanding } from "@/components/admin/admin-module-landing";
import { AuditLogs } from "@/components/audit/audit-logs";
import { useAuth } from "@/components/providers/auth-provider";

export default function AuditLogsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminModuleLanding feature="audit_log_center" />
  ) : (
    <AuditLogs />
  );
}
