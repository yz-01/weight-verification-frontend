import { notFound } from "next/navigation";

import { Dashboard } from "@/components/dashboard/dashboard";
import {
  ADMIN_DASHBOARD_SECTIONS,
  type AdminDashboardSection,
} from "@/lib/admin-dashboard";

export function generateStaticParams() {
  return ADMIN_DASHBOARD_SECTIONS.map((section) => ({ section }));
}

export default async function AdminDashboardSectionPage(props: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await props.params;
  if (!ADMIN_DASHBOARD_SECTIONS.includes(section as AdminDashboardSection)) {
    notFound();
  }
  return <Dashboard adminSection={section as AdminDashboardSection} />;
}
