"use client";

/**
 * Supplier and date range, one control for every office list that needs them
 * (2026-10 B5, B3, C14, B16).
 *
 * The client: the office lists must be filterable by supplier and by date. The
 * material receipt list, the material outgoing list and a category's records
 * dialog all ask the same two questions, so they share this one control and
 * send the same three parameters - `supplier`, `date_from`, `date_to` - which
 * each of those endpoints reads.
 *
 * The supplier is a dropdown you can type into: a company can have a hundred
 * suppliers, and scrolling a plain list for one is the slow part of the job.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import type { useListQuery } from "@/hooks/use-list-query";
import { getSuppliers } from "@/services/contractor.service";

export interface SupplierDateValue {
  supplier?: string;
  date_from?: string;
  date_to?: string;
}

// The "every supplier" entry needs a value of its own; "" means "nothing typed".
const ALL = "__all__";

export function SupplierDateFilter({
  value,
  onChange,
  showSupplier = true,
  showDates = true,
}: {
  value: SupplierDateValue;
  /** Only the keys that changed; `undefined` clears one. */
  onChange: (next: SupplierDateValue) => void;
  /** Off where the records have no supplier (a hazard, a progress photo). */
  showSupplier?: boolean;
  showDates?: boolean;
}) {
  const t = useTranslations("supplierDateFilter");
  const suppliers = useQuery({
    queryKey: ["suppliers", "filter-options"],
    queryFn: () => getSuppliers({ page_size: 200, sort_by: "name" }),
    enabled: showSupplier,
  });
  const options = [
    { value: ALL, label: t("allSuppliers") },
    ...(suppliers.data?.results ?? []).map((row) => ({ value: row.id, label: row.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSupplier && (
        <>
          <div className="w-[200px] max-w-full">
            <OptionCombobox
              value={value.supplier ?? ALL}
              onChange={(next) => onChange({ supplier: next === ALL ? undefined : next })}
              options={options}
              placeholder={t("allSuppliers")}
              searchPlaceholder={t("search")}
              emptyLabel={t("noMatch")}
              ariaLabel={t("supplier")}
              triggerClassName="h-8 text-sm"
            />
          </div>
          <QueryFailedNote query={suppliers} what={t("what")} />
        </>
      )}
      {showDates && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label={t("from")}
            title={t("from")}
            className="h-8 w-[140px] text-sm"
            value={value.date_from ?? ""}
            max={value.date_to || undefined}
            onChange={(event) => onChange({ date_from: event.target.value || undefined })}
          />
          <span className="text-xs text-muted-foreground">{t("to")}</span>
          <Input
            type="date"
            aria-label={t("toLabel")}
            title={t("toLabel")}
            className="h-8 w-[140px] text-sm"
            value={value.date_to ?? ""}
            min={value.date_from || undefined}
            onChange={(event) => onChange({ date_to: event.target.value || undefined })}
          />
        </div>
      )}
    </div>
  );
}

/** The same control bound to a list's URL parameters (`useListQuery`). */
export function SupplierDateListFilter({
  list,
}: {
  list: ReturnType<typeof useListQuery>;
}) {
  return (
    <SupplierDateFilter
      value={{
        supplier: list.filters.supplier,
        date_from: list.filters.date_from,
        date_to: list.filters.date_to,
      }}
      onChange={(next) => list.setFilters(next as Record<string, string | undefined>)}
    />
  );
}
