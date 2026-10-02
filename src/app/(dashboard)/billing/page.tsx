"use client";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { useAuth } from "@/components/providers/auth-provider";

export default function BillingPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <ModuleHubRedirect portal="MSE_ADMIN" feature="billing_commission" />
  ) : (
    <BillingWorkspace />
  );
}
