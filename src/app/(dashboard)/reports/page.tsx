"use client";

import { AdminModuleLanding } from "@/components/admin/admin-module-landing";
import { useAuth } from "@/components/providers/auth-provider";
import { TransactionReport } from "@/components/reports/transaction-report";

export default function ReportsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminModuleLanding feature="report_center" />
  ) : (
    <TransactionReport />
  );
}
