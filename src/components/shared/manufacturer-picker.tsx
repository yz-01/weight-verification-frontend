"use client";

/**
 * Choose the 指定厂商（MR） - one control for the phone's delivery, return and
 * request forms and the office's approval dialog (2026-10 D1, Q13; 2026-10-10).
 *
 * - The choices are the company's supplier list, searchable: the client's
 *   「这个厂商也是同样是供应商，只是在MR 业主要求著名订购厂」 - a manufacturer is
 *   a supplier, named only when the owner requires one. The category's
 *   designated ones come first.
 * - Nothing is added from here: a company missing from the list is added on
 *   the supplier page by the office, like any supplier.
 * - One the category does not designate is allowed and marked 「非指定厂商」
 *   in orange: a warning, never a refusal.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OptionCombobox, type ComboOption } from "@/components/material-requests/option-combobox";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { useDebounce } from "@/hooks/use-debounce";
import { isOffList } from "@/lib/material-autofill";
import { cn } from "@/lib/utils";
import { getManufacturers } from "@/services/material-setup.service";

const NONE = "__none__";

export interface DesignatedManufacturer {
  id: string;
  name: string;
  is_active: boolean;
}

/** The orange 「非指定厂商」 tag (D1): shown wherever a record's manufacturer is. */
export function OffListBadge({ className }: { className?: string }) {
  const t = useTranslations("manufacturers");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning",
        className,
      )}
    >
      {t("offList")}
    </span>
  );
}

/** A manufacturer's name for a list cell, with the tag when it is off the list. */
export function ManufacturerCell({
  name,
  offList,
}: {
  name?: string | null;
  offList?: boolean;
}) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
      <span className="truncate" title={name}>{name}</span>
      {offList && <OffListBadge />}
    </span>
  );
}

/**
 * Whether any row in view names a manufacturer (2026-10-10): the 指定厂商（MR）
 * column is shown only then - day to day the 供应商 column is what matters.
 */
export function anyNamedManufacturer(
  rows: readonly { manufacturer_name?: string | null }[] | null | undefined,
): boolean {
  return (rows ?? []).some((row) => Boolean(row.manufacturer_name));
}

/** A list's columns without the 指定厂商（MR） one when no row in view names one. */
export function hideEmptyManufacturerColumn<C>(
  columns: readonly C[],
  rows: readonly { manufacturer_name?: string | null }[] | null | undefined,
): C[] {
  if (anyNamedManufacturer(rows)) return [...columns];
  return columns.filter((column) => {
    const definition = column as { id?: string; accessorKey?: unknown };
    return definition.accessorKey !== "manufacturer_name" && definition.id !== "manufacturer_name";
  });
}

export function ManufacturerPicker({
  value,
  onChange,
  designated = [],
  autoFilled = false,
  disabled = false,
  knownName,
  triggerClassName,
}: {
  value: string;
  onChange: (id: string) => void;
  /** The chosen one's name when it is not on the first page of results. */
  knownName?: string | null;
  /** The category's designated manufacturers, offered first. */
  designated?: readonly DesignatedManufacturer[];
  /** The category filled this in; say so under the picker. */
  autoFilled?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  const t = useTranslations("manufacturers");
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  // The chosen one's name, remembered when it scrolls off a searched page.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const list = useQuery({
    queryKey: ["manufacturers", "picker", search],
    queryFn: () =>
      getManufacturers({ is_active: "true", page_size: 100, ...(search ? { search } : {}) }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const designatedIds = new Set(designated.filter((row) => row.is_active).map((row) => row.id));
  const rows = list.data?.results ?? [];
  const options: ComboOption[] = [
    { value: NONE, label: t("picker.none") },
    ...designated
      .filter((row) => row.is_active)
      .map((row) => ({ value: row.id, label: `${row.name} · ${t("picker.designated")}` })),
    ...rows
      .filter((row) => !designatedIds.has(row.id))
      .map((row) => ({ value: row.id, label: row.name })),
  ];
  const selectedLabel =
    designated.find((row) => row.id === value)?.name ??
    rows.find((row) => row.id === value)?.name ??
    (picked && picked.id === value ? picked.name : undefined) ??
    (value ? knownName ?? undefined : undefined);
  const offList = isOffList({ manufacturer_options: designated }, value);

  return (
    <div className="space-y-1.5">
      <OptionCombobox
        value={value || NONE}
        onChange={(next) => {
          const row = rows.find((option) => option.id === next);
          if (row) setPicked({ id: row.id, name: row.name });
          onChange(next === NONE ? "" : next);
        }}
        options={options}
        onSearch={setTerm}
        selectedLabel={selectedLabel}
        placeholder={t("picker.choose")}
        searchPlaceholder={t("picker.choose")}
        emptyLabel={t("empty")}
        ariaLabel={t("column")}
        disabled={disabled}
        triggerClassName={triggerClassName}
      />
      <QueryFailedNote query={list} what={t("what")} />
      {autoFilled && value && !offList && (
        <p className="text-xs text-muted-foreground">{t("picker.fromColumn")}</p>
      )}
      {offList && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-warning">
          <OffListBadge />
          {t("offListHint")}
        </p>
      )}
    </div>
  );
}
