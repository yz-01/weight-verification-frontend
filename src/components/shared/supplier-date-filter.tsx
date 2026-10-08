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
 * What is typed is searched on the server (`?search=`), because one page is
 * at most 100 rows (`core/pagination.py`) and a company with more suppliers
 * than that could never have found the rest in a list loaded once.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OptionCombobox, type ComboOption } from "@/components/material-requests/option-combobox";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { SupplierReturnBadge, type ReturnBadgeSupplier } from "@/components/suppliers/supplier-return-badge";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import type { useListQuery } from "@/hooks/use-list-query";
import type { ListQuery } from "@/interfaces/api";
import { getSupplier, getSuppliers } from "@/services/contractor.service";
import { getManufacturers } from "@/services/material-setup.service";

export interface SupplierDateValue {
  supplier?: string;
  /** By whose make (2026-10 D1) - material lists only. */
  manufacturer?: string;
  date_from?: string;
  date_to?: string;
}

// The "every supplier" entry needs a value of its own; "" means "nothing typed".
const ALL = "__all__";

/** The server's page ceiling (`core/pagination.py`); asking for more gets this. */
export const SUPPLIER_PAGE_SIZE = 100;

/** One page of suppliers matching what was typed, by name. */
export function supplierSearchQuery(term: string): ListQuery {
  const search = term.trim();
  return { page_size: SUPPLIER_PAGE_SIZE, sort_by: "name", ...(search ? { search } : {}) };
}

/**
 * The picker's rows: "every supplier", then this page of results. The chosen
 * supplier's name is carried separately (`selectedLabel`) when it is not on
 * this page, so the button never falls back to showing an id.
 */
export function supplierOptions(
  results: readonly ReturnBadgeSupplier[],
  allLabel: string,
): ComboOption[] {
  return [
    { value: ALL, label: allLabel },
    ...results.map((row) => ({
      value: row.id,
      label: row.name,
      // 「有退场资料」 (2026-10 C10), as a mark in the list.
      ...(row.completed_return_count
        ? { suffix: <SupplierReturnBadge supplier={row} interactive={false} /> }
        : {}),
    })),
  ];
}

export function SupplierDateFilter({
  value,
  onChange,
  showSupplier = true,
  showDates = true,
  showManufacturer = false,
}: {
  value: SupplierDateValue;
  /** Only the keys that changed; `undefined` clears one. */
  onChange: (next: SupplierDateValue) => void;
  /** Off where the records have no supplier (a hazard, a progress photo). */
  showSupplier?: boolean;
  showDates?: boolean;
  /** The manufacturer too (2026-10 D1): material records only. */
  showManufacturer?: boolean;
}) {
  const t = useTranslations("supplierDateFilter");
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const suppliers = useQuery({
    queryKey: ["suppliers", "filter-options", search],
    queryFn: () => getSuppliers(supplierSearchQuery(search)),
    enabled: showSupplier,
    // The last page stays up while the next word is fetched, rather than the
    // list flashing empty between letters.
    placeholderData: keepPreviousData,
  });
  const results = suppliers.data?.results ?? [];
  const options = supplierOptions(results, t("allSuppliers"));
  // The name of the chosen one, remembered from when it was picked, or read
  // once when the filter arrives from a link with only its id.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const chosen = value.supplier;
  const onPage = chosen ? results.some((row) => row.id === chosen) : true;
  const known = picked && picked.id === chosen ? picked.name : undefined;
  // query-failure: only the button's label; the picker's own failure note covers the list
  const chosenRow = useQuery({
    queryKey: ["suppliers", "filter-label", chosen],
    queryFn: () => getSupplier(chosen!),
    enabled: showSupplier && Boolean(chosen) && !onPage && !known,
    staleTime: 5 * 60_000,
  });
  const selectedLabel = known ?? chosenRow.data?.name;

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      {showSupplier && (
        <>
          <div className="w-full sm:w-52">
            <OptionCombobox
              value={value.supplier ?? ALL}
              onChange={(next) => {
                const row = results.find((option) => option.id === next);
                if (row) setPicked({ id: row.id, name: row.name });
                onChange({ supplier: next === ALL ? undefined : next });
              }}
              options={options}
              onSearch={setTerm}
              selectedLabel={selectedLabel}
              placeholder={t("allSuppliers")}
              searchPlaceholder={t("search")}
              emptyLabel={t("noMatch")}
              ariaLabel={t("supplier")}
              triggerClassName="w-full"
            />
          </div>
          {/* The chosen one's returns, one press away (2026-10 C10). */}
          <SupplierReturnBadge
            supplier={results.find((row) => row.id === chosen) ?? chosenRow.data}
          />
          <QueryFailedNote query={suppliers} what={t("what")} />
        </>
      )}
      {showManufacturer && (
        <ManufacturerFilter
          value={value.manufacturer}
          onChange={(manufacturer) => onChange({ manufacturer })}
        />
      )}
      {showDates && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            aria-label={t("from")}
            title={t("from")}
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            value={value.date_from ?? ""}
            max={value.date_to || undefined}
            onChange={(event) => onChange({ date_from: event.target.value || undefined })}
          />
          <span className="text-xs text-muted-foreground">{t("to")}</span>
          <Input
            type="date"
            aria-label={t("toLabel")}
            title={t("toLabel")}
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            value={value.date_to ?? ""}
            min={value.date_from || undefined}
            onChange={(event) => onChange({ date_to: event.target.value || undefined })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The manufacturer half (2026-10 D1): the company's list, searched on the
 * server like the suppliers, switched-off ones included - an old record's
 * factory must still be findable.
 */
function ManufacturerFilter({
  value,
  onChange,
}: {
  value?: string;
  onChange: (next: string | undefined) => void;
}) {
  const t = useTranslations("supplierDateFilter");
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const manufacturers = useQuery({
    queryKey: ["manufacturers", "filter-options", search],
    queryFn: () => getManufacturers({ page_size: SUPPLIER_PAGE_SIZE, ...(search ? { search } : {}) }),
    placeholderData: keepPreviousData,
  });
  const results = manufacturers.data?.results ?? [];
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <div className="w-full sm:w-52">
        <OptionCombobox
          value={value ?? ALL}
          onChange={(next) => {
            const row = results.find((option) => option.id === next);
            if (row) setPicked({ id: row.id, name: row.name });
            onChange(next === ALL ? undefined : next);
          }}
          options={supplierOptions(results, t("allManufacturers"))}
          onSearch={setTerm}
          selectedLabel={picked && picked.id === value ? picked.name : undefined}
          placeholder={t("allManufacturers")}
          searchPlaceholder={t("search")}
          emptyLabel={t("noMatch")}
          ariaLabel={t("manufacturer")}
          triggerClassName="w-full"
        />
      </div>
      <QueryFailedNote query={manufacturers} what={t("whatManufacturers")} />
    </>
  );
}

/** The same control bound to a list's URL parameters (`useListQuery`). */
export function SupplierDateListFilter({
  list,
  showManufacturer = false,
}: {
  list: ReturnType<typeof useListQuery>;
  /** Material lists also filter by manufacturer (2026-10 D1). */
  showManufacturer?: boolean;
}) {
  return (
    <SupplierDateFilter
      value={{
        supplier: list.filters.supplier,
        manufacturer: list.filters.manufacturer,
        date_from: list.filters.date_from,
        date_to: list.filters.date_to,
      }}
      showManufacturer={showManufacturer}
      onChange={(next) => list.setFilters(next as Record<string, string | undefined>)}
    />
  );
}
