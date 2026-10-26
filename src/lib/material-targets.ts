/**
 * 材料目标 (I18): what the screen draws from a target's figures. Pure, so
 * vitest holds the rules.
 */

import type { MaterialTarget, MaterialTargetStatus, MaterialTargetTranche } from "@/interfaces/material-target";

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

/**
 * The colours an addition's line is drawn in (JB26: 「新目标显示在旧目标下一行，
 * 用不同颜色区分」). Theme tones, so each reads in light and dark; the original
 * keeps the page's own colour. Past the last, they go round again.
 */
const ADDED_TONES = [
  { row: "bg-tone-purple/8", text: "text-tone-purple-fg", bar: "bg-tone-purple" },
  { row: "bg-tone-cyan/8", text: "text-tone-cyan-fg", bar: "bg-tone-cyan" },
  { row: "bg-tone-amber/10", text: "text-tone-amber-fg", bar: "bg-tone-amber" },
  { row: "bg-tone-rose/8", text: "text-tone-rose-fg", bar: "bg-tone-rose" },
  { row: "bg-tone-blue/8", text: "text-tone-blue-fg", bar: "bg-tone-blue" },
] as const;

const ORIGINAL_TONE = { row: "bg-muted/30", text: "text-muted-foreground", bar: "bg-primary" } as const;

export interface TrancheLine {
  /** 0 for the original, 1 for the first addition, … */
  index: number;
  tranche: MaterialTargetTranche;
  row: string;
  text: string;
  bar: string;
  /** The bar's width, 0-100. */
  width: number;
}

/**
 * A target's lines as the table draws them, below its own row - or none when
 * it was never raised (one line says no more than the row above it).
 */
export function trancheLines(row: Pick<MaterialTarget, "tranches">): TrancheLine[] {
  const tranches = row.tranches ?? [];
  if (tranches.length < 2) return [];
  return tranches.map((tranche, index) => {
    const tone = index === 0 ? ORIGINAL_TONE : ADDED_TONES[(index - 1) % ADDED_TONES.length];
    const width = tranche.percent === null ? 0 : Math.max(0, Math.min(tranche.percent, 100));
    return { index, tranche, ...tone, width };
  });
}

/**
 * The target after adding `amount` to `current`, three decimals, or null when
 * the amount is not one the server takes. Counted in thousandths so 0.1 + 0.2
 * reads 0.300.
 */
export function targetAfterAdding(current: string, amount: string): string | null {
  if (!isValidTargetQuantity(amount)) return null;
  const thousandths = (value: string) => Math.round(Number(value.replace(/,/g, "")) * 1000);
  const total = thousandths(current) + thousandths(amount);
  if (!Number.isFinite(total) || total >= 1e14) return null;
  return (total / 1000).toFixed(3);
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
