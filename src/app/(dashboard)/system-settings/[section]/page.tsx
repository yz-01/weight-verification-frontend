import {
  SystemSettingsWorkspace,
  type SystemSettingsSection,
} from "@/components/platform-settings/system-settings-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<SystemSettingsSection>([
  "basic",
  "saas",
  "commission",
  "cwe",
  "cctv",
  "anpr",
  "qr",
  "api-gateway",
  "versions",
  "notifications",
  "maintenance",
  "feature-flags",
]);

export default async function SystemSettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "activity") redirect("/audit-logs/search?category=SETTINGS");
  return (
    <SystemSettingsWorkspace
      section={
        SECTIONS.has(section as SystemSettingsSection)
          ? (section as SystemSettingsSection)
          : "overview"
      }
    />
  );
}
