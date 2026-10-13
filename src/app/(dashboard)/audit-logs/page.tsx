"use client";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import { AuditLogs } from "@/components/audit/audit-logs";
import { useAuth } from "@/components/providers/auth-provider";

export default function AuditLogsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <ModuleHubRedirect portal="MSE_ADMIN" feature="audit_log_center" />
  ) : (
    // 用户操作记录 exports what its filters show (H16, HD13).
    <AuditLogs showExport />
  );
}
