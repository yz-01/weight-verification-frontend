import { notFound } from "next/navigation";

import {
  ContractorReportHistoryWorkspace,
  ContractorReportWorkspace,
} from "@/components/contractor-ops/contractor-report-workspace";
import type { ContractorReportType } from "@/interfaces/contractor-report";

const TYPES = new Set<ContractorReportType>([
  "progress", "safety", "consultant", "attendance",
  "equipment", "recycling", "schedule", "target",
]);

export default async function ContractorReportPage({
  params,
}: {
  params: Promise<{ reportType: string }>;
}) {
  const { reportType } = await params;
  if (reportType === "history") return <ContractorReportHistoryWorkspace />;
  if (!TYPES.has(reportType as ContractorReportType)) notFound();
  return <ContractorReportWorkspace reportType={reportType as ContractorReportType} />;
}
