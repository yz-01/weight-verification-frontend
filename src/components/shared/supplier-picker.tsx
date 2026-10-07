"use client";

/**
 * Choose one supplier from the company's list, typing to search (2026-10 D1,
 * D2): who a material request is bought from. The search runs on the server,
 * so a list longer than one page is still searchable end to end.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { supplierSearchQuery } from "@/components/shared/supplier-date-filter";
import { useDebounce } from "@/hooks/use-debounce";
import { getSuppliers } from "@/services/contractor.service";

export function SupplierPicker({
  value,
  onChange,
  knownName,
  placeholder,
  allowNone = false,
  triggerClassName,
}: {
  value: string;
  onChange: (id: string) => void;
  /** The chosen one's name when it is not on the first page of results. */
  knownName?: string | null;
  placeholder: string;
  /** Offer 「未填写」 to clear it - for a suggestion, not for an approval. */
  allowNone?: boolean;
  triggerClassName?: string;
}) {
  const t = useTranslations("supplierDateFilter");
  const none = useTranslations("manufacturers.picker");
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const suppliers = useQuery({
    queryKey: ["suppliers", "picker", search],
    queryFn: () => getSuppliers(supplierSearchQuery(search)),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const rows = (suppliers.data?.results ?? []).filter((row) => row.is_active || row.id === value);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const options = [
    ...(allowNone ? [{ value: "__none__", label: none("none") }] : []),
    ...rows.map((row) => ({ value: row.id, label: row.name })),
  ];
  const selectedLabel =
    rows.find((row) => row.id === value)?.name ??
    (picked && picked.id === value ? picked.name : undefined) ??
    knownName ??
    undefined;
  return (
    <div className="space-y-1">
      <OptionCombobox
        value={value || (allowNone ? "__none__" : "")}
        onChange={(next) => {
          const row = rows.find((option) => option.id === next);
          if (row) setPicked({ id: row.id, name: row.name });
          onChange(next === "__none__" ? "" : next);
        }}
        options={options}
        onSearch={setTerm}
        selectedLabel={selectedLabel}
        placeholder={placeholder}
        searchPlaceholder={t("search")}
        emptyLabel={t("noMatch")}
        ariaLabel={t("supplier")}
        triggerClassName={triggerClassName}
      />
      <QueryFailedNote query={suppliers} what={t("what")} />
    </div>
  );
}
