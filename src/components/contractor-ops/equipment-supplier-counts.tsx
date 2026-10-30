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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { CountCardsFold } from "@/components/shared/count-cards-fold";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { NO_SUPPLIER_VALUE } from "@/components/shared/supplier-date-filter";
import type { useListQuery } from "@/hooks/use-list-query";
import type { ListQuery } from "@/interfaces/api";
import type { EquipmentSupplierCounts } from "@/interfaces/contractor-ops";
import { getEquipmentSupplierCounts } from "@/services/contractor-ops.service";
import { getSupplier } from "@/services/contractor.service";

/** What the numbers follow: everything but the supplier and 在场状态 chosen, and the page. */
const NOT_COUNTED = ["page", "page_size", "sort_by", "sort_order", "supplier", "presence", "view"];

export function countsQuery(query: ListQuery): ListQuery {
  return Object.fromEntries(Object.entries(query).filter(([key]) => !NOT_COUNTED.includes(key)));
}

export interface Headline {
  /** The supplier's name, null for 「没有供应商」 and when none is chosen. */
  supplier: string | null;
  /** Whether a supplier is chosen and named (「没有供应商」 is `noSupplier`). */
  chosen: boolean;
  noSupplier: boolean;
  onSite: number;
  total: number;
}

/**
 * The numbers of the supplier chosen (summed over projects), or of everything.
 *
 * A supplier with no machines here has no row to read its name from, so the
 * name the filter knows (`knownName`) says whose 0 / 0 it is.
 */
export function headlineOf(
  data: EquipmentSupplierCounts,
  supplier: string | undefined,
  knownName?: string | null,
): Headline {
  if (!supplier) {
    return { supplier: null, chosen: false, noSupplier: false, onSite: data.on_site, total: data.total };
  }
  const noSupplier = supplier === NO_SUPPLIER_VALUE;
  const rows = data.results.filter((row) => (noSupplier ? row.supplier === null : row.supplier === supplier));
  const name = noSupplier ? null : (rows[0]?.supplier_name ?? knownName ?? null);
  return {
    supplier: name,
    chosen: !noSupplier && Boolean(name),
    noSupplier,
    onSite: rows.reduce((sum, row) => sum + row.on_site, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0),
  };
}

/** Whether 按供应商汇总 is open: the reader's last choice on this browser, open at first. */
const FOLD_KEY = "equipment-supplier-counts-open";

type CountsT = ReturnType<typeof useTranslations<"contractorOps.equipment.supplierCounts">>;

/** 「ABC 租赁：在场 3 台 / 共 5 台」, 「没有供应商：…」 or the whole line. */
export function headlineText(t: CountsT, headline: Headline): string {
  const numbers = t("headline", { onSite: headline.onSite, total: headline.total });
  const name = headline.noSupplier ? t("noSupplier") : headline.chosen ? headline.supplier : null;
  return name ? t("headlineFor", { name, numbers }) : numbers;
}

/** The line, for the screen and for the top of the exported file. */
export function useEquipmentSupplierCounts(list: ReturnType<typeof useListQuery>, enabled: boolean) {
  const t = useTranslations("contractorOps.equipment.supplierCounts");
  const qc = useQueryClient();
  const supplier = list.filters.supplier;
  // query-failure: EquipmentSupplierCountsPanel shows the QueryFailedNote for this query
  const query = useQuery({
    queryKey: ["equipment-supplier-counts", countsQuery(list.query)],
    queryFn: () => getEquipmentSupplierCounts(countsQuery(list.query)),
    enabled,
  });
  // The chosen supplier's name, for one with no machines here (no row names
  // it). The filter's own label query, so it is usually already cached.
  const named = Boolean(supplier) && supplier !== NO_SUPPLIER_VALUE;
  const nameKey = ["suppliers", "filter-label", supplier];
  // query-failure: only the headline's name; the 0 / 0 shows without it
  const nameQuery = useQuery({
    queryKey: nameKey,
    queryFn: () => getSupplier(supplier!),
    enabled:
      enabled &&
      named &&
      Boolean(query.data) &&
      !query.data?.results.some((row) => row.supplier === supplier),
    staleTime: 5 * 60_000,
  });
  const headline = query.data ? headlineOf(query.data, supplier, nameQuery.data?.name) : null;
  const text = headline ? headlineText(t, headline) : "";

  /**
   * The line for an export: waits for the numbers (and the name) when the
   * export is pressed before they arrived, so the file never goes out
   * without its summary.
   */
  const exportText = async (): Promise<string> => {
    const data = query.data ?? (await query.refetch()).data;
    if (!data) return "";
    let name: string | null | undefined;
    if (named && !data.results.some((row) => row.supplier === supplier)) {
      name = await qc
        .fetchQuery({ queryKey: nameKey, queryFn: () => getSupplier(supplier!), staleTime: 5 * 60_000 })
        .then((row) => row.name)
        .catch(() => null);
    }
    return headlineText(t, headlineOf(data, supplier, name));
  };
  return { query, headline, text, exportText };
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
          {/* Machines, not the quantity typed on an entry (I36): 台 is a machine. */}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t("countRule")}</span>
        </p>
      )}
      <QueryFailedNote query={counts.query} what={t("what")} />
      {data && data.results.length > 0 && (
        // The folding card the roster's 「按工种汇总」 shares (JB91).
        <CountCardsFold
          storageKey={FOLD_KEY}
          title={t("tableTitle")}
          badge={t("supplierCount", { count: data.results.length })}
          foldHint={t("foldHint")}
          unfoldHint={t("unfoldHint")}
          pickHint={t("pickHint")}
          cards={data.results.map((row) => {
            const value = row.supplier ?? NO_SUPPLIER_VALUE;
            const active = chosen === value;
            return {
              key: `${row.supplier ?? "none"}:${row.project ?? ""}`,
              label: (row.supplier ? row.supplier_name : t("noSupplier")) ?? "",
              sub: data.by_project ? (row.project_name ?? undefined) : undefined,
              active,
              onPress: () => list.setFilter("supplier", active ? undefined : value),
              numbers: (
                <>
                  <span className={`font-semibold ${row.on_site > 0 ? "text-success" : "text-muted-foreground"}`}>
                    {t("onSite")} {row.on_site}
                  </span>
                  {" · "}
                  {t("total")} {row.total}
                </>
              ),
            };
          })}
        />
      )}
    </div>
  );
}
