/** 项目现场费用总览 (JB259, 客户 11-24b 事项 6): the five site costs of a project. */

import { api } from "@/services/api-client";

/** The five sources, in the client's order (事项 6). */
export const SITE_COST_SOURCES = [
  "material_cost",
  "equipment_rental",
  "progress_claim",
  "sundry_claims",
  "disposal",
] as const;
export type SiteCostSource = (typeof SITE_COST_SOURCES)[number];

export interface SiteCostAmount {
  key: SiteCostSource;
  /** RM as a string; null when 金额查看 is off for the reader. */
  amount: string | null;
  /** False: the source has no money field (yet) - shown as 0 and said so. */
  available: boolean;
  /** Per cent of the total, one decimal; null when the total is 0. */
  share: string | null;
}

export interface SiteCostMonth {
  month: string;
  date_from: string;
  date_to: string;
  sources: { key: SiteCostSource; amount: string | null }[];
  total_amount: string | null;
}

export interface SiteCostOverview {
  project: string;
  date_from: string;
  date_to: string;
  total_amount: string | null;
  sources: SiteCostAmount[];
  months: SiteCostMonth[];
}

export function getSiteCostOverview(query: {
  project?: string;
  date_from: string;
  date_to: string;
}): Promise<SiteCostOverview> {
  return api.get<SiteCostOverview>("/api/site-cost-overview/get_overview/", {
    date_from: query.date_from,
    date_to: query.date_to,
    ...(query.project ? { project: query.project } : {}),
  });
}

/**
 * Where 「查看明细」 and the quick links go: the source's own report with the
 * same project and dates, so its rows add up to the amount here.
 */
export function siteCostReportHref(
  source: SiteCostSource,
  filters: { project?: string; date_from: string; date_to: string },
): string {
  const params = new URLSearchParams();
  if (filters.project) params.set("project", filters.project);
  params.set("date_from", filters.date_from);
  params.set("date_to", filters.date_to);
  const base = {
    material_cost: "/reports/material-cost",
    equipment_rental: "/reports/contractor/equipment",
    progress_claim: "/reports/contractor/claims",
    sundry_claims: "/reports/contractor/sundry_claims",
    disposal: "/reports/contractor/recycling",
  }[source];
  // 杂费报销: the claims the office approved - what the amount counts.
  if (source === "sundry_claims") params.set("status", "CONFIRMED");
  return `${base}?${params.toString()}`;
}
