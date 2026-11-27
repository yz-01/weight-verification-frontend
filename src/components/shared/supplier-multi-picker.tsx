"use client";

/**
 * Choose none, one or several suppliers from the company's list (JB292, 客户
 * 11-27f: 「供应商由必填改为选填，并支持同时选择多家供应商」): the material
 * request's 供应商. The chosen ones sit on top as chips with a big ✕, each
 * with its 「有退货资料」 mark that opens the returns (2026-10 C10); below, a
 * box to type a name into and the matching suppliers to tick. The search runs
 * on the server, so a list longer than one page is still searchable.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { MultiPickList } from "@/components/shared/multi-pick-list";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { supplierSearchQuery } from "@/components/shared/supplier-date-filter";
import { SupplierReturnBadge, type ReturnBadgeSupplier } from "@/components/suppliers/supplier-return-badge";
import { useDebounce } from "@/hooks/use-debounce";
import { getSuppliers } from "@/services/contractor.service";

export function SupplierMultiPicker({
  value,
  onChange,
  known = [],
}: {
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** The ones already on the record, named even when not on this page of results. */
  known?: readonly ReturnBadgeSupplier[];
}) {
  const t = useTranslations("supplierDateFilter");
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const suppliers = useQuery({
    queryKey: ["suppliers", "picker", search],
    queryFn: () => getSuppliers(supplierSearchQuery(search)),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const rows = (suppliers.data?.results ?? []).filter((row) => row.is_active || value.includes(row.id));
  // What each chosen one is known as: this page of results, else the record.
  const byId: Record<string, ReturnBadgeSupplier> = {};
  for (const row of known) byId[row.id] = row;
  for (const row of rows) byId[row.id] = row;
  return (
    <div className="space-y-1" data-slot="supplier-multi-picker">
      <MultiPickList
        selected={value}
        onChange={onChange}
        options={rows.map((row) => ({
          id: row.id,
          name: row.name,
          suffix: <SupplierReturnBadge supplier={row} interactive={false} />,
        }))}
        knownNames={Object.fromEntries(known.map((row) => [row.id, row.name]))}
        search={term}
        onSearch={setTerm}
        searchPlaceholder={t("search")}
        ariaLabel={t("supplier")}
        chipExtra={(id) => <SupplierReturnBadge supplier={byId[id]} />}
        large
      />
      {search && !suppliers.isFetching && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noMatch")}</p>
      )}
      <QueryFailedNote query={suppliers} what={t("what")} />
    </div>
  );
}
