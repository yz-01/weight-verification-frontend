"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { RecyclerCompanySettingsWorkspace } from "@/components/recycler-business/recycler-company-settings-workspace";
import { CompanySiteSettingsWorkspace } from "@/components/site-access/company-site-settings";

export default function CompanySettingsPage() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  return user.company_type === "RECYCLER"
    ? <RecyclerCompanySettingsWorkspace />
    : <CompanySiteSettingsWorkspace />;
}
