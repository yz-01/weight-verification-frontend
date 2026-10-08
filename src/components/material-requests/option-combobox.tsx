"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
  /**
   * A mark after the label in the list - 「有退场资料」 beside a supplier
   * (2026-10 C10). Only a mark: pressing the option still chooses it.
   */
  suffix?: React.ReactNode;
}

/**
 * A dropdown you can type into to narrow (C02 「可搜索下拉」).
 *
 * Only the listed options can be chosen: the lists are kept by the back
 * office so the totals group like with like, and a free-typed 「rebar 12mm」
 * beside the listed 「Rebar / Y12」 would be a second row for the same thing.
 */
export function OptionCombobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled = false,
  ariaLabel,
  triggerClassName,
  onSearch,
  selectedLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Size of the button, where the default full-width one does not fit (a toolbar). */
  triggerClassName?: string;
  /**
   * Searched by the server instead of in the list (2026-10): what is typed is
   * handed over and `options` is taken to be the answer already, so a list
   * longer than one page can still be searched end to end.
   */
  onSearch?: (term: string) => void;
  /** The chosen value's name when `options` (one page of results) lacks it. */
  selectedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (onSearch || !needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, term, onSearch]);
  const selected = options.find((option) => option.value === value);
  const changeTerm = (next: string) => {
    setTerm(next);
    onSearch?.(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) changeTerm("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("w-full justify-between px-3 font-normal", triggerClassName)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? selectedLabel ?? (value || placeholder)}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => changeTerm(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
        <ul role="listbox" className="max-h-60 overflow-y-auto">
          {shown.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</li>
          ) : (
            shown.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted pointer-coarse:min-h-11"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    changeTerm("");
                  }}
                >
                  <Check className={cn("size-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option.label}</span>
                  {option.suffix}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
