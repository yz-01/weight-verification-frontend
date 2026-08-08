"use client";

import { useParams } from "next/navigation";

import { ContractorModuleLanding } from "@/components/contractor-ops/contractor-module-landing";
import type { PortalFeatureKey } from "@/lib/navigation";

const MODULE_FEATURES: Record<string, PortalFeatureKey> = {
  projects: "projects",
  categories: "project_categories",
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
  const feature = MODULE_FEATURES[params.module];
  if (!feature) return null;
  return <ContractorModuleLanding feature={feature} />;
}
