"use client";

/**
 * Pick several from a company list (2026-10 A4, D1): the suppliers a material
 * category allows, the manufacturers it designates.
 *
 * The chosen ones sit on top as chips, so the office sees the answer without
 * scrolling; below, a box to type into and the matching rows to tick. What is
 * typed is handed to `onSearch` so a list longer than one page can still be
 * searched end to end.
 */

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface PickOption {
  id: string;
  name: string;
}

export function MultiPickList({
  selected,
  onChange,
  options,
  knownNames,
  onSearch,
  search,
  searchPlaceholder,
  ariaLabel,
}: {
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** This page of results for what was typed. */
  options: readonly PickOption[];
  /** Names of chosen ones that may not be on this page. */
  knownNames: Readonly<Record<string, string>>;
  search: string;
  onSearch: (term: string) => void;
  searchPlaceholder: string;
  ariaLabel: string;
}) {
  const t = useTranslations("categoryManagement.material");
  const names: Record<string, string> = { ...knownNames };
  for (const option of options) names[option.id] = option.name;
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...new Set([...selected, id])] : selected.filter((value) => value !== id));
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex min-h-7 flex-wrap gap-1.5">
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("noneChosen")}</span>
        ) : (
          selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs font-medium"
            >
              {names[id] ?? "…"}
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`${ariaLabel}: ${names[id] ?? ""}`}
                onClick={() => toggle(id, false)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <Input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className="h-9"
      />
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {options.map((option) => (
          <label key={option.id} className="flex min-h-9 items-center gap-3">
            <Checkbox
              checked={selected.includes(option.id)}
              onCheckedChange={(checked) => toggle(option.id, checked === true)}
            />
            <span className="text-sm">{option.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
