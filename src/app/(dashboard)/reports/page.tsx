"use client";

import { AdminModuleLanding } from "@/components/admin/admin-module-landing";
import { ContractorReportCenter } from "@/components/contractor-ops/contractor-report-center";
import { useAuth } from "@/components/providers/auth-provider";
import { TransactionReport } from "@/components/reports/transaction-report";
import { RecyclerReportCenter } from "@/components/reports/recycler-report-center";

export default function ReportsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminModuleLanding feature="report_center" />
  ) : user?.portal === "MSE_TRACE" ? (
    <ContractorReportCenter />
  ) : user?.portal === "MSE_SCRAP" ? (
    <RecyclerReportCenter />
  ) : (
    <TransactionReport />
  );
}
