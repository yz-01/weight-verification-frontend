import {
  AdminQRWorkspace,
  type AdminQRSection,
} from "@/components/qrcodes/admin-qr-workspace";
import { redirect } from "next/navigation";

const SECTIONS = new Set<AdminQRSection>([
  "types",
  "scans",
  "anomalies",
]);

export default async function AdminQRSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (["register", "lifecycle", "search", "statistics"].includes(section)) {
    redirect("/qr-codes/types");
  }
  if (section === "activity") redirect("/audit-logs/search?category=QR");
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
