"use client";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import { useAuth } from "@/components/providers/auth-provider";
import { TransactionReport } from "@/components/reports/transaction-report";
import { RecyclerReportCenter } from "@/components/reports/recycler-report-center";

export default function ReportsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <ModuleHubRedirect portal="MSE_ADMIN" feature="report_center" />
  ) : user?.portal === "MSE_TRACE" ? (
    // The page of report cards is gone (A03, B04): reports are chosen from
    // 【选择报表】 on every report page, and this address opens the first.
    <ModuleHubRedirect portal="MSE_TRACE" feature="report_center" />
  ) : user?.portal === "MSE_SCRAP" ? (
    <RecyclerReportCenter />
  ) : (
    <TransactionReport />
  );
}
