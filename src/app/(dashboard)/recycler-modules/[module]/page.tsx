"use client";

import { useParams } from "next/navigation";
import { RecyclerModuleLanding } from "@/components/recycler-business/recycler-module-landing";
import type { PortalFeatureKey } from "@/lib/navigation";

const FEATURES: Record<string, PortalFeatureKey> = {
  customer_management: "customer_management",
  yards: "yards",
  waste_orders: "waste_orders",
  weighing_records: "weighing_records",
  inventory_management: "inventory_management",
};

export default function RecyclerModulePage() {
  const { module } = useParams<{ module: string }>();
  return <RecyclerModuleLanding feature={FEATURES[module]} />;
}
