import {
  MonitoringWorkspace,
  type MonitoringSection,
} from "@/components/monitoring/monitoring-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<MonitoringSection>([
  "live-platform",
  "cwe",
  "cctv",
  "anpr",
  "api-gateway",
  "sync",
  "exceptions",
  "records",
]);

export default async function MonitoringSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (["service-search", "runtime-statistics"].includes(section)) {
    redirect("/monitoring/live-platform");
  }
  return (
    <MonitoringWorkspace
      section={
        SECTIONS.has(section as MonitoringSection)
          ? (section as MonitoringSection)
          : "overview"
      }
    />
  );
}
