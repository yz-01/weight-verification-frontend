"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ContractorModuleLanding } from "@/components/contractor-ops/contractor-module-landing";
import type { PortalFeatureKey } from "@/lib/navigation";

// No `categories`: 「现场资料」 is no longer a container (D-283). Its old
// landing address goes to Category Management instead.
const REDIRECTS: Record<string, string> = {
  categories: "/category-management",
};

const MODULE_FEATURES: Record<string, PortalFeatureKey> = {
  projects: "projects",
  suppliers: "suppliers",
  equipment: "equipment",
  materials: "material_receipts",
  progress: "progress",
  recycling: "recyclers",
  safety: "safety",
  consultants: "consultant_applications",
  hazards: "hazard_rectification",
  documents: "documents",
  reports: "report_center",
  location: "geofences",
  "site-access": "site_access",
  users: "users",
  "company-settings": "company_settings",
  notifications: "notifications",
};

export default function ContractorModulePage() {
  const params = useParams<{ module: string }>();
  const router = useRouter();
  const redirect = REDIRECTS[params.module];
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);
  const feature = MODULE_FEATURES[params.module];
  if (redirect || !feature) return null;
  return <ContractorModuleLanding feature={feature} />;
}
