"use client";

/**
 * 「待处理」 on a list: which rows are behind the sidebar's number, and how many.
 *
 * Lucas (2026-10-09): 「在旁边那里弄多一个提示显示哪些是还没有处理的写号码出来，
 * 加起来就等于sidebar的号码」. Every list a sidebar badge opens marks each row
 * the badge counts, just left of the row's own buttons, and its header says
 * 「待处理 N」 - N is the badge. Pressing it shows only those rows.
 *
 * Nothing here decides which rows those are. The list endpoint says so per
 * row (`needs_action`) and for the page (`needs_action_count`), from the same
 * backend definition the badge counts (`contractor_ops.sidebar_badges.
 * needs_action_rows`); the filter is the endpoint's own `needs_action=1`.
 * Working it out again here would be a second rule, and two rules drift.
 */
import type { ColumnDef } from "@tanstack/react-table";
import { CircleDot } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

/** The list parameter that shows only the rows waiting on this reader. */
export const NEEDS_ACTION_PARAM = "needs_action";

/** What a row of a counted list carries. Absent on an older response. */
export interface NeedsActionRow {
  needs_action?: boolean;
}

/** The pill on one row. Nothing at all for a row nobody is waiting on. */
export function NeedsActionMarker({
  show,
  className,
}: {
  show: boolean | undefined;
  className?: string;
}) {
  const t = useTranslations("needsAction");
  if (!show) return null;
  return (
    <span
      data-needs-action="true"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary/40 bg-primary/12 px-2 py-0.5 text-[0.6875rem] font-semibold leading-none text-primary",
        className,
      )}
    >
      <CircleDot className="size-3" aria-hidden="true" />
      {t("marker")}
    </span>
  );
}

/**
 * 「待处理 N」 in the page header: the sidebar's number for this page, and
 * the switch that shows only those rows.
 *
 * Shown while there is something waiting, and while the filter is on (so it
 * can be turned off again even after the last row was dealt with). A count
 * the page has not loaded yet shows nothing - the same as the sidebar.
 */
export function NeedsActionChip({
  count,
  active,
  onToggle,
}: {
  count: number | undefined;
  active: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("needsAction");
  if (!active && !(typeof count === "number" && count > 0)) return null;
  const hint = active ? t("chipClear") : t("chipHint");
  return (
    <button
      type="button"
      data-needs-action-chip="true"
      aria-pressed={active}
      title={hint}
      onClick={() => onToggle(!active)}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors pointer-coarse:h-10",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-glow-sm"
          : "border-primary/40 bg-primary/12 text-primary hover:bg-primary/20",
      )}
    >
      <CircleDot className="size-4" aria-hidden="true" />
      {t("chip", { count: count ?? 0 })}
    </button>
  );
}

/**
 * The 「待处理」 column, for a table whose last column is the row's buttons:
 * put it just before them.
 */
export function needsActionColumn<T extends NeedsActionRow>(
  label: string,
): ColumnDef<T, unknown> {
  return {
    id: "needs_action",
    enableHiding: false,
    meta: { label },
    header: () => <span className="sr-only">{label}</span>,
    cell: ({ row }) => <NeedsActionMarker show={row.original.needs_action} />,
  };
}

/**
 * The columns with 「待处理」 placed just left of the row's buttons
 * (`id: "actions"`), or at the end when the table has none.
 */
export function withNeedsActionColumn<T extends NeedsActionRow>(
  columns: ColumnDef<T, unknown>[],
  label: string,
): ColumnDef<T, unknown>[] {
  const marker = needsActionColumn<T>(label);
  const at = columns.findIndex((column) => column.id === "actions");
  if (at < 0) return [...columns, marker];
  return [...columns.slice(0, at), marker, ...columns.slice(at)];
}

/**
 * `[on, set]` for a list that keeps its own state rather than `useListQuery`:
 * the URL's `needs_action=1`, so a filtered view is still a link.
 */
export function useNeedsActionParam(): [boolean, (next: boolean) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(NEEDS_ACTION_PARAM) === "1";
  const set = useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set(NEEDS_ACTION_PARAM, "1");
      else params.delete(NEEDS_ACTION_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  return [active, set];
}

/** Whether a list's URL state has the 「待处理」 filter on. */
export function needsActionActive(filters: Record<string, string>): boolean {
  return filters[NEEDS_ACTION_PARAM] === "1";
}

/**
 * `NeedsActionChip` for a list whose state is `useListQuery`: the filter is
 * the URL's `needs_action=1`, which every such list sends.
 */
export function ListNeedsActionChip({
  list,
  count,
}: {
  list: {
    filters: Record<string, string>;
    setFilter: (key: string, value: string | undefined) => void;
  };
  count: number | undefined;
}) {
  return (
    <NeedsActionChip
      count={count}
      active={needsActionActive(list.filters)}
      onToggle={(next) => list.setFilter(NEEDS_ACTION_PARAM, next ? "1" : undefined)}
    />
  );
}
