import {
  MonitoringWorkspace,
  type MonitoringSection,
} from "@/components/monitoring/monitoring-workspace";

const SECTIONS = new Set<MonitoringSection>([
  "live-platform",
  "cwe",
  "cctv",
  "anpr",
  "api-gateway",
  "sync",
  "exceptions",
  "service-search",
  "runtime-statistics",
  "records",
]);

export default async function MonitoringSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
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
