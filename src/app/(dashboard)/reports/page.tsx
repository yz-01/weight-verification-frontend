"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { AdminReportWorkspace } from "@/components/reports/admin-report-workspace";
import { TransactionReport } from "@/components/reports/transaction-report";

export default function ReportsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminReportWorkspace />
  ) : (
    <TransactionReport />
  );
}
