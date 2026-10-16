"use client";

/**
 * 设备清单: how many of each supplier's machines are on site now (2026-10 I36).
 *
 * One line above the filters - 「ABC 租赁：在场 3 台 / 共 5 台」, or the whole
 * project's when no supplier is chosen - and a small table that can be folded
 * away, one row per supplier, most on site first. Pressing a row filters the
 * register by that supplier. The numbers come from one server aggregate that
 * counts "on site" the way the register's own status does, so this page cannot
 * disagree with the entry and exit pages.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { QueryFailedNote } from "@/components/shared/page-primitives";
import { NO_SUPPLIER_VALUE } from "@/components/shared/supplier-date-filter";
import type { useListQuery } from "@/hooks/use-list-query";
import type { ListQuery } from "@/interfaces/api";
import type { EquipmentSupplierCounts } from "@/interfaces/contractor-ops";
import { getEquipmentSupplierCounts } from "@/services/contractor-ops.service";

/** What the numbers follow: everything but the supplier and 在场状态 chosen, and the page. */
const NOT_COUNTED = ["page", "page_size", "sort_by", "sort_order", "supplier", "presence", "view"];

export function countsQuery(query: ListQuery): ListQuery {
  return Object.fromEntries(Object.entries(query).filter(([key]) => !NOT_COUNTED.includes(key)));
}

export interface Headline {
  /** The supplier's name, null for 「没有供应商」 and when none is chosen. */
  supplier: string | null;
  /** Whether a supplier (or 「没有供应商」) is chosen. */
  chosen: boolean;
  noSupplier: boolean;
  onSite: number;
  total: number;
}

/** The numbers of the supplier chosen (summed over projects), or of everything. */
export function headlineOf(data: EquipmentSupplierCounts, supplier: string | undefined): Headline {
  if (!supplier) {
    return { supplier: null, chosen: false, noSupplier: false, onSite: data.on_site, total: data.total };
  }
  const noSupplier = supplier === NO_SUPPLIER_VALUE;
  const rows = data.results.filter((row) => (noSupplier ? row.supplier === null : row.supplier === supplier));
  return {
    supplier: noSupplier ? null : (rows[0]?.supplier_name ?? null),
    chosen: !noSupplier && rows.length > 0,
    noSupplier,
    onSite: rows.reduce((sum, row) => sum + row.on_site, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0),
  };
}

/** The line, for the screen and for the top of the exported file. */
export function useEquipmentSupplierCounts(list: ReturnType<typeof useListQuery>, enabled: boolean) {
  const t = useTranslations("contractorOps.equipment.supplierCounts");
  const query = useQuery({
    queryKey: ["equipment-supplier-counts", countsQuery(list.query)],
    queryFn: () => getEquipmentSupplierCounts(countsQuery(list.query)),
    enabled,
  });
  const headline = query.data ? headlineOf(query.data, list.filters.supplier) : null;
  let text = "";
  if (headline) {
    const numbers = t("headline", { onSite: headline.onSite, total: headline.total });
    const name = headline.noSupplier ? t("noSupplier") : headline.chosen ? headline.supplier : null;
    text = name ? t("headlineFor", { name: name ?? "", numbers }) : numbers;
  }
  return { query, headline, text };
}

export function EquipmentSupplierCountsPanel({
  list,
  counts,
}: {
  list: ReturnType<typeof useListQuery>;
  counts: ReturnType<typeof useEquipmentSupplierCounts>;
}) {
  const t = useTranslations("contractorOps.equipment.supplierCounts");
  const data = counts.query.data;
  const chosen = list.filters.supplier;
  return (
    <div className="flex basis-full flex-col gap-2">
      {counts.text && (
        <p className="text-sm font-semibold" aria-live="polite">
          {counts.text}
        </p>
      )}
      <QueryFailedNote query={counts.query} what={t("what")} />
      {data && data.results.length > 0 && (
        <details open className="rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="flex min-h-9 cursor-pointer items-center text-sm font-medium">
            {t("tableTitle")}
          </summary>
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("supplier")}</th>
                  {data.by_project && <th className="py-1 pr-3 font-medium">{t("project")}</th>}
                  <th className="py-1 pr-3 text-right font-medium">{t("onSite")}</th>
                  <th className="py-1 text-right font-medium">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((row) => {
                  const value = row.supplier ?? NO_SUPPLIER_VALUE;
                  const active = chosen === value;
                  return (
                    <tr key={`${row.supplier ?? "none"}:${row.project ?? ""}`} className={active ? "bg-primary/10" : undefined}>
                      <td className="py-0.5 pr-3">
                        <button
                          type="button"
                          aria-pressed={active}
                          className="min-h-9 text-left font-medium text-primary underline-offset-2 hover:underline pointer-coarse:min-h-11"
                          onClick={() => list.setFilter("supplier", active ? undefined : value)}
                        >
                          {row.supplier ? row.supplier_name : t("noSupplier")}
                        </button>
                      </td>
                      {data.by_project && <td className="py-0.5 pr-3">{row.project_name}</td>}
                      <td className="py-0.5 pr-3 text-right tabular-nums">{row.on_site}</td>
                      <td className="py-0.5 text-right tabular-nums">{row.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
