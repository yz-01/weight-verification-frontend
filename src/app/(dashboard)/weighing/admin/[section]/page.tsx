import {
  AdminCWEWorkspace,
  type AdminCWESection,
} from "@/components/weighing/admin-cwe-workspace";

const SECTIONS = new Set<AdminCWESection>([
  "scales",
  "connections",
  "live-weighing",
  "anomalies",
  "search",
  "statistics",
  "service-status",
  "activity",
]);

export default async function AdminCWESectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return (
    <AdminCWEWorkspace
      section={
        SECTIONS.has(section as AdminCWESection)
          ? (section as AdminCWESection)
          : "overview"
      }
    />
  );
}
