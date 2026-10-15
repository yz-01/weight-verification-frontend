/**
 * 材料目标 (I18): what the screen draws from a target's figures. Pure, so
 * vitest holds the rules.
 */

import type { MaterialTarget, MaterialTargetStatus } from "@/interfaces/material-target";

/** The progress bar: filled to the percent (full past 100), coloured by state. */
export function targetBar(row: Pick<MaterialTarget, "percent" | "status">): { width: number; tone: string } {
  const width = row.percent === null ? 0 : Math.max(0, Math.min(row.percent, 100));
  const tone: Record<MaterialTargetStatus, string> = {
    NORMAL: "bg-primary",
    APPROACHING: "bg-warning",
    REACHED: "bg-success",
    EXCEEDED: "bg-destructive",
  };
  return { width, tone: tone[row.status] };
}

/** The status badge's tone, in the page primitives' words. */
export function targetTone(status: MaterialTargetStatus): "neutral" | "warning" | "positive" | "danger" {
  if (status === "EXCEEDED") return "danger";
  if (status === "REACHED") return "positive";
  if (status === "APPROACHING") return "warning";
  return "neutral";
}

/**
 * The 接近 / 达到 lines as typed - 「80, 100」 - or null when they cannot be
 * read. Whole percentages from 1 to 100; empty means "no line" (超出 is
 * always said). The server checks the same.
 */
export function parseTargetAlerts(text: string): number[] | null {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/[,，\s]+/).filter(Boolean);
  const numbers = parts.map(Number);
  if (numbers.some((value) => !Number.isInteger(value) || value < 1 || value > 100)) return null;
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/** A target figure: above zero, at most three decimal places. */
export function isValidTargetQuantity(value: string): boolean {
  const text = value.replace(/,/g, "").trim();
  return /^\d+(\.\d{1,3})?$/.test(text) && Number(text) > 0 && Number(text) < 1e11;
}

/**
 * The records behind a target (ID42): its deliveries, and its confirmed
 * returns, each list already filtered to the project, the material and - when
 * the target has one - the specification.
 */
export function targetRecordLinks(
  row: Pick<MaterialTarget, "project" | "category" | "spec_category">,
): { deliveries: string; returns: string } {
  const query = new URLSearchParams({ project: row.project, category: row.category });
  if (row.spec_category) query.set("spec_category", row.spec_category);
  const returns = new URLSearchParams(query);
  returns.set("status", "COMPLETED");
  return { deliveries: `/receipts?${query.toString()}`, returns: `/material-outgoing?${returns.toString()}` };
}

/** Where head office lands for one project (ID42). */
export function projectTargetsLink(project: string): string {
  return `/material-targets?project=${encodeURIComponent(project)}`;
}
