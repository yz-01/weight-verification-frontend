"use client";

/**
 * Choose the factory that made the material (2026-10 D1, Q13) - one control
 * for the phone's delivery, return and request forms and the office's
 * approval dialog.
 *
 * - The company's own list, searchable; the category's designated
 *   manufacturers first.
 * - 「名单里没有？新增」 adds one by name without leaving the form; a name
 *   already on the list comes back as that one (the server matches it
 *   ignoring case), so nobody creates 「YKGI」 twice.
 * - A manufacturer the category does not designate is allowed and marked
 *   「非指定厂商」 in orange: a warning, never a refusal.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OptionCombobox, type ComboOption } from "@/components/material-requests/option-combobox";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { ApiError } from "@/interfaces/api";
import { isOffList } from "@/lib/material-autofill";
import { cn } from "@/lib/utils";
import { getManufacturers, quickAddManufacturer } from "@/services/material-setup.service";

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

export function ManufacturerPicker({
  value,
  onChange,
  designated = [],
  allowAdd = true,
  autoFilled = false,
  disabled = false,
  triggerClassName,
}: {
  value: string;
  onChange: (id: string) => void;
  /** The category's designated manufacturers, offered first. */
  designated?: readonly DesignatedManufacturer[];
  /** 「名单里没有？新增」 - on for the forms, off where only the list may be used. */
  allowAdd?: boolean;
  /** The category filled this in; say so under the picker. */
  autoFilled?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  const t = useTranslations("manufacturers");
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  // Names remembered from a quick add, so the button shows the new one before
  // the list is fetched again.
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
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
    (added && added.id === value ? added.name : undefined);

  const quickAdd = useMutation({
    mutationFn: (name: string) => quickAddManufacturer(name),
    onSuccess: (row) => {
      setAddError("");
      setNewName("");
      setAdded({ id: row.id, name: row.name });
      onChange(row.id);
      void qc.invalidateQueries({ queryKey: ["manufacturers"] });
    },
    onError: (reason) =>
      setAddError(reason instanceof ApiError ? reason.message : t("picker.failed")),
  });
  const add = () => {
    setAddError("");
    // A manufacturer is a row other people pick, so it is not invented
    // offline and reconciled later - two workers would add it twice.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setAddError(t("picker.offline"));
      return;
    }
    quickAdd.mutate(newName.trim());
  };
  const offList = isOffList({ manufacturer_options: designated }, value);

  return (
    <div className="space-y-1.5">
      <OptionCombobox
        value={value || NONE}
        onChange={(next) => onChange(next === NONE ? "" : next)}
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
      {allowAdd && !disabled && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">{t("picker.addNew")}</summary>
          <div className="mt-2 flex items-center gap-2">
            <Input
              aria-label={t("picker.newName")}
              placeholder={t("picker.newName")}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="h-10 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              // Not `requires`: an empty box here is not a field the
              // surrounding form is missing - the manufacturer is optional.
              disabledReason={!newName.trim() ? t("picker.newName") : undefined}
              disabled={quickAdd.isPending || !newName.trim()}
              onClick={add}
            >
              {quickAdd.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              {t("picker.add")}
            </Button>
          </div>
          {addError && <p role="alert" className="mt-1 text-xs text-destructive">{addError}</p>}
        </details>
      )}
    </div>
  );
}
