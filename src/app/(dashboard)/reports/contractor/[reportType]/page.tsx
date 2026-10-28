import { notFound, redirect } from "next/navigation";

import {
  ContractorReportHistoryWorkspace,
  ContractorReportWorkspace,
} from "@/components/contractor-ops/contractor-report-workspace";
import type { ContractorReportType } from "@/interfaces/contractor-report";

const TYPES = new Set<ContractorReportType>([
  "progress", "safety", "consultant", "attendance",
  "equipment", "recycling", "schedule", "target",
  "documents",
  // 工程进度's own reports (I8, ID24).
  "daily_report", "progress_summary",
  // The four modules that had no report (I11, ID27).
  "field_tasks", "material_outgoing", "claims", "sundry_claims",
  // 材料退货记录（RN）and 材料不合格记录 (J29).
  "material_returns", "material_rejections",
]);

export default async function ContractorReportPage({
  params,
}: {
  params: Promise<{ reportType: string }>;
}) {
  const { reportType } = await params;
  if (reportType === "history") return <ContractorReportHistoryWorkspace />;
  // 「现场照片报表」 is gone from the report center (JB47, 客户 10-28): each
  // module's own records already carry their photographs. An old link or
  // bookmark opens the report center instead of an error.
  if (reportType === "photos") redirect("/modules/reports");
  if (!TYPES.has(reportType as ContractorReportType)) notFound();
  return <ContractorReportWorkspace reportType={reportType as ContractorReportType} />;
}
