"use client";

import { AdminModuleLanding } from "@/components/admin/admin-module-landing";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { useAuth } from "@/components/providers/auth-provider";

export default function BillingPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminModuleLanding feature="billing_commission" />
  ) : (
    <BillingWorkspace />
  );
}
