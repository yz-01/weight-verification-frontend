"use client";

import { useParams } from "next/navigation";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import type { PortalFeatureKey } from "@/lib/navigation";

// The old card pages of the recycler console (A03): each forwards to the
// module's first child this person can open.
const FEATURES: Record<string, PortalFeatureKey> = {
  customer_management: "customer_management",
  yards: "yards",
  waste_orders: "waste_orders",
  weighing_records: "weighing_records",
  inventory_management: "inventory_management",
};

export default function RecyclerModulePage() {
  const { module } = useParams<{ module: string }>();
  const feature = FEATURES[module];
  if (!feature) return null;
  return <ModuleHubRedirect portal="MSE_SCRAP" feature={feature} />;
}
