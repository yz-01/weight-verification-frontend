"use client";

import { AuditCenterWorkspace } from "@/components/audit/audit-center-workspace";
import { AuditLogs } from "@/components/audit/audit-logs";
import { useAuth } from "@/components/providers/auth-provider";

export default function AuditLogsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? <AuditCenterWorkspace /> : <AuditLogs />;
}
