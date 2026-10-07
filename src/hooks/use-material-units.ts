"use client";

/**
 * The company's unit list, and how to name a unit (2026-10 A4).
 *
 * The six built-in codes keep their translations (`receipts.unit.*`); a unit
 * the office added in 「单位管理」 has no translation anywhere, so it is named
 * by its own label - from the row itself when the API sent one, else from
 * the unit list.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { isBuiltInMaterialUnit, type MaterialUnitOption } from "@/interfaces/contractor";
import { getMaterialUnits } from "@/services/material-setup.service";

export const MATERIAL_UNITS_QUERY_KEY = ["material-units"] as const;

/** The active units a form offers, in the office's order. */
export function useMaterialUnits(options: { includeInactive?: boolean; enabled?: boolean } = {}) {
  const includeInactive = Boolean(options.includeInactive);
  return useQuery({
    queryKey: [...MATERIAL_UNITS_QUERY_KEY, includeInactive ? "all" : "active"],
    queryFn: () => getMaterialUnits(includeInactive),
    staleTime: 5 * 60_000,
    enabled: options.enabled ?? true,
  });
}

/** Pure: a unit's name in the reader's language, given the translator. */
export function materialUnitName(
  translate: (key: string) => string,
  code: string | null | undefined,
  label?: string | null,
  units?: readonly MaterialUnitOption[],
): string {
  if (!code) return "";
  if (isBuiltInMaterialUnit(code)) return translate(`receipts.unit.${code}`);
  return label || units?.find((row) => row.code === code)?.label || code;
}

/**
 * `(code, label?) => name`, reading the unit list for codes a row arrived
 * without a label for.
 */
export function useUnitName() {
  const t = useTranslations();
  // query-failure: a unit with no label falls back to its code, which is still readable
  const units = useMaterialUnits({ includeInactive: true });
  const rows = units.data;
  const translate = useCallback((key: string) => t(key), [t]);
  return useMemo(
    () => (code: string | null | undefined, label?: string | null) =>
      materialUnitName(translate, code, label, rows),
    [translate, rows],
  );
}

/**
 * `{code: name}` for every unit the company has, built-in and added - what an
 * export column needs to print names instead of codes.
 */
export function useUnitExportValues(): Record<string, string> {
  const t = useTranslations();
  // query-failure: an export prints a unit's code when its name could not be read
  const units = useMaterialUnits({ includeInactive: true });
  const rows = units.data;
  return useMemo(() => {
    const values: Record<string, string> = {};
    for (const code of ["TONNE", "KG", "M3", "PIECE", "LOAD", "BAG"] as const) {
      values[code] = t(`receipts.unit.${code}`);
    }
    for (const row of rows ?? []) {
      if (!row.built_in) values[row.code] = row.label;
    }
    return values;
  }, [t, rows]);
}
