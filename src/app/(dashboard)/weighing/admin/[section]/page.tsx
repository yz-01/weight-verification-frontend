import {
  AdminCWEWorkspace,
  type AdminCWESection,
} from "@/components/weighing/admin-cwe-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<AdminCWESection>([
  "scales",
  "connections",
  "live-weighing",
  "anomalies",
  "search",
  "statistics",
  "service-status",
]);

export default async function AdminCWESectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "activity") redirect("/audit-logs/search?category=CWE");
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
