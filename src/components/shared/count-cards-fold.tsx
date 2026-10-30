"use client";

/**
 * A folding card of small count cards that filter the list under them.
 *
 * First drawn for the equipment list's 「按供应商汇总」 (I36; Lucas 10/17: the
 * small table looked plain, and nobody could tell it folds), and reused for
 * the roster's 「按工种汇总」 (JB91, 客户 10-31: 「参考设备进退场「按供应商汇总」
 * 的设计」). The heading says it folds and which way; the reader's choice is
 * kept on this browser under `storageKey`. Pressing a card chooses it,
 * pressing it again lets it go - the caller decides what that filters.
 */

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

export interface CountCard {
  key: string;
  label: string;
  /** A second line under the name (the project, when cards are split by one). */
  sub?: string;
  /** The numbers line. */
  numbers: ReactNode;
  active: boolean;
  /** Greyed: nothing to count here. */
  muted?: boolean;
  onPress: () => void;
}

function readOpen(storageKey: string): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(storageKey) !== "closed";
  } catch {
    return true;
  }
}

export function CountCardsFold({
  storageKey,
  title,
  badge,
  foldHint,
  unfoldHint,
  pickHint,
  aside,
  cards,
}: {
  storageKey: string;
  title: string;
  badge?: string;
  foldHint: string;
  unfoldHint: string;
  pickHint: string;
  /** A line beside the hint (「最后更新：…」). */
  aside?: ReactNode;
  cards: CountCard[];
}) {
  const [open, setOpen] = useState(() => readOpen(storageKey));
  const remember = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      // Private window: it just opens next time.
    }
  };
  return (
    <details
      open={open}
      onToggle={(event) => remember(event.currentTarget.open)}
      className="group rounded-xl border border-panel-border bg-muted/20"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
        <span>{title}</span>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{badge}</span>
        )}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          <span className="hidden group-open:inline">{foldHint}</span>
          <span className="group-open:hidden">{unfoldHint}</span>
        </span>
      </summary>
      <div className="border-t border-panel-border px-4 py-3">
        <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{pickHint}</span>
          {aside}
        </p>
        <ul className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2 overflow-y-auto">
          {cards.map((card) => (
            <li key={card.key}>
              <button
                type="button"
                aria-pressed={card.active}
                className={`flex w-full min-h-14 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition hover:border-primary/60 hover:bg-primary/5 ${card.active ? "border-primary bg-primary/10" : "border-panel-border bg-card"} ${card.muted && !card.active ? "opacity-70" : ""}`}
                onClick={card.onPress}
              >
                <span className="w-full truncate text-sm font-medium text-foreground" title={card.label}>
                  {card.label}
                </span>
                {card.sub && <span className="w-full truncate text-xs text-muted-foreground">{card.sub}</span>}
                <span className="text-xs text-muted-foreground tabular-nums">{card.numbers}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
