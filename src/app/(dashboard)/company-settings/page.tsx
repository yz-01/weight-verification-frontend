"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { RecyclerCompanySettingsWorkspace } from "@/components/recycler-business/recycler-company-settings-workspace";
import { CompanySettingsGate } from "@/components/shared/company-settings-gate";
import { CompanySiteSettingsWorkspace } from "@/components/site-access/company-site-settings";

export default function CompanySettingsPage() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  // JB239 (客户 11-23 事项 11): the six-digit sign-off PIN first, then the page.
  return (
    <CompanySettingsGate>
      {user.company_type === "RECYCLER"
        ? <RecyclerCompanySettingsWorkspace />
        : <CompanySiteSettingsWorkspace />}
    </CompanySettingsGate>
  );
}
