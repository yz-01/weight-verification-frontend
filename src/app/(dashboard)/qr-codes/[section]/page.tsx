import {
  AdminQRWorkspace,
  type AdminQRSection,
} from "@/components/qrcodes/admin-qr-workspace";

const SECTIONS = new Set<AdminQRSection>([
  "types",
  "register",
  "lifecycle",
  "search",
  "scans",
  "anomalies",
  "statistics",
  "activity",
]);

export default async function AdminQRSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return (
    <AdminQRWorkspace
      section={
        SECTIONS.has(section as AdminQRSection)
          ? (section as AdminQRSection)
          : "overview"
      }
    />
  );
}
