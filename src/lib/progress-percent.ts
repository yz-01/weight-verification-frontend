"use client";

/**
 * 实际完成比例 as every progress screen prints it.
 *
 * Optional since H5/H11 (HD2): 「百分比可以保留，但是不一定要填」. A record may
 * arrive with photographs and a 施工分类 only, so the value is a string or
 * null, and an empty one reads 「未填」 - never `null%` or a bar at zero that
 * would claim nothing was done.
 */

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/** True when the record carries a percentage. */
export function hasPercent(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

/** `"45.00%"`, or `unfilled` when nothing was filled in. */
export function percentText(value: string | null | undefined, unfilled: string): string {
  return hasPercent(value) ? `${value}%` : unfilled;
}

/** The reader's `percentText`, with 「未填」 in their language. */
export function usePercentText(): (value: string | null | undefined) => string {
  const t = useTranslations("contractorOps.progress");
  const unfilled = t("percentUnfilled");
  // Stable across renders, so a table's column definitions can depend on it.
  return useCallback((value) => percentText(value, unfilled), [unfilled]);
}
