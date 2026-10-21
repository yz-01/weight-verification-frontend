"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A–Z appears above the list once it is longer than this (J10-3). */
export const LETTERS_FROM = 30;
/** 「#」: a name starting with a digit, a Chinese character or anything else. */
const OTHER = "#";
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", OTHER];

/** The letter a name is filed under in the A–Z row. */
export function initialOf(label: string): string {
  const first = label.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : OTHER;
}

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
 *
 * J10 (Q10): the wheel scrolls the list only - the popover is modal, so a
 * dialog behind it does not scroll as well, and the list's end does not pass
 * the scroll on - and a long list (more than `LETTERS_FROM`) has an A–Z row
 * above it: a letter shows the names starting with it, again shows all, and
 * it works together with the search box.
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
  emptyAction,
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
  /**
   * Shown under `emptyLabel` when nothing matches - 「前往分类管理」 beside
   * 「该材料尚未建立」 (I19-11, I19-12).
   */
  emptyAction?: React.ReactNode;
}) {
  const t = useTranslations("common.combobox");
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const lettered = options.length > LETTERS_FROM;
  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const typed =
      onSearch || !needle
        ? options
        : options.filter((option) => option.label.toLowerCase().includes(needle));
    return letter ? typed.filter((option) => initialOf(option.label) === letter) : typed;
  }, [options, term, onSearch, letter]);
  const selected = options.find((option) => option.value === value);
  const changeTerm = (next: string) => {
    setTerm(next);
    onSearch?.(next);
  };

  return (
    <Popover
      // Modal: inside a dialog the wheel scrolls this list, not both (J10-1).
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          changeTerm("");
          setLetter(null);
        }
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
        {lettered && (
          <div role="group" aria-label={t("byLetter")} className="mb-2 flex flex-wrap gap-0.5">
            {LETTERS.map((each) => (
              <button
                key={each}
                type="button"
                aria-pressed={letter === each}
                onClick={() => setLetter((current) => (current === each ? null : each))}
                className={cn(
                  "min-w-6 rounded px-1 py-0.5 text-xs font-medium tabular-nums transition",
                  letter === each ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {each}
              </button>
            ))}
          </div>
        )}
        <ul role="listbox" className="max-h-60 overflow-y-auto overscroll-contain">
          {shown.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              {emptyLabel}
              {emptyAction && <div className="mt-2 flex justify-center">{emptyAction}</div>}
            </li>
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
                    setLetter(null);
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
