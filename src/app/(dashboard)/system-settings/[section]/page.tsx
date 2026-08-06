import {
  SystemSettingsWorkspace,
  type SystemSettingsSection,
} from "@/components/platform-settings/system-settings-workspace";

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
  "activity",
]);

export default async function SystemSettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
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
