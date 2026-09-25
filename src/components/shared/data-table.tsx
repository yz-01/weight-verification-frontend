"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { PAGE_SIZE_OPTIONS } from "@/hooks/use-list-query";
import { cn } from "@/lib/utils";

export interface FilterPill {
  key: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isError: boolean;
  hasFilters: boolean;
  search: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  /** Persists column visibility per table. */
  storageKey: string;
  filterPills?: FilterPill[];
  /** Extra toolbar controls, shown left of Columns. Secondary actions only. */
  toolbarActions?: React.ReactNode;
  /**
   * Open a row by clicking anywhere on it.
   *
   * The customer's complaint behind T-304: the actions were small icons at the
   * right-hand end of the row, and they could not find them - 「以为没做」.
   * Making the whole row the target is the fix; the drawer it opens is where
   * the actions become buttons with words on them.
   *
   * A row is only interactive when this is given, so every other table keeps
   * exactly the behaviour it has.
   */
  onRowClick?: (row: T) => void;
  /**
   * A class for one row, for a record whose state the whole row has to show -
   * the overdue disposal the customer asked to see 「整条记录显示红色」 (D-217).
   */
  rowClassName?: (row: T) => string | undefined;
  onSearchChange: (value: string) => void;
  onSortChange: (field: string, order: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onClearFilters: () => void;
}

/**
 * The table page body: toolbar, one scroll region, pagination footer.
 *
 * The card is a flex column with the body as the only scrolling child, so the
 * toolbar and footer stay pinned while the rows move underneath. Empty, error
 * and loading states render inside the table body rather than replacing it, so
 * the column headers never disappear and the layout never jumps.
 */
export function DataTable<T>({
  columns,
  rows,
  totalCount,
  page,
  pageSize,
  isLoading,
  isError,
  hasFilters,
  search,
  sortBy,
  sortOrder,
  storageKey,
  filterPills,
  toolbarActions,
  onRowClick,
  rowClassName,
  onSearchChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onClearFilters,
}: DataTableProps<T>) {
  const t = useTranslations();

  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounce(searchDraft, 300);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    if (debouncedSearch !== search) onSearchChange(debouncedSearch);
    // Only the debounced draft should push a change; reacting to `search` here
    // would fight the URL when the browser's back button restores it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Column visibility is a personal preference, not shared state, so it stays
  // in local storage rather than the URL.
  useEffect(() => {
    const stored = window.localStorage.getItem(`mse.columns.${storageKey}`);
    if (stored) {
      try {
        setColumnVisibility(JSON.parse(stored) as VisibilityState);
      } catch {
        window.localStorage.removeItem(`mse.columns.${storageKey}`);
      }
    }
  }, [storageKey]);

  const sorting: SortingState = useMemo(
    () => (sortBy ? [{ id: sortBy, desc: sortOrder === "desc" }] : []),
    [sortBy, sortOrder],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility },
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const entry = next[0];
      onSortChange(entry?.id ?? "", entry?.desc ? "desc" : "asc");
    },
    onColumnVisibilityChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(columnVisibility) : updater;
      setColumnVisibility(next);
      window.localStorage.setItem(
        `mse.columns.${storageKey}`,
        JSON.stringify(next),
      );
    },
  });

  const columnCount = table.getVisibleLeafColumns().length;
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="shrink-0 border-b">
        {filterPills && filterPills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-6 pt-4">
            {filterPills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={pill.onSelect}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  pill.active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {pill.active && <Check className="h-3 w-3" />}
                {pill.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-4 py-4 sm:px-6">
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={t("common.searchPlaceholder")}
              className="h-9 bg-card pl-9"
            />
          </div>

          {toolbarActions && (
            <div className="ml-auto flex items-center gap-2">{toolbarActions}</div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 rounded-full bg-card px-4",
                  !toolbarActions && "ml-auto",
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t("common.columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {typeof column.columnDef.meta === "object" &&
                    column.columnDef.meta !== null &&
                    "label" in column.columnDef.meta
                      ? String(column.columnDef.meta.label)
                      : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="w-full min-w-max">
          <TableHeader className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="h-11 px-6 text-xs font-semibold text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {Array.from({ length: columnCount }).map((__, cellIndex) => (
                    <TableCell key={`skeleton-cell-${cellIndex}`} className="px-6 py-3">
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="p-0 text-center">
                  <div className="sticky left-0 flex min-h-36 w-[100cqw] flex-col items-center justify-center px-6 whitespace-normal">
                    <p className="text-sm font-medium text-foreground">
                      {t("table.errorTitle")}
                    </p>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      {t("table.errorBody")}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="p-0 text-center">
                  <div className="sticky left-0 flex min-h-36 w-[100cqw] flex-col items-center justify-center px-6 whitespace-normal">
                    <p className="max-w-md text-sm text-muted-foreground">
                      {hasFilters
                        ? t("table.noResultsFiltered")
                        : t("table.noResults")}
                    </p>
                    {hasFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 rounded-full px-4"
                        onClick={onClearFilters}
                      >
                        <FilterX className="h-3.5 w-3.5" />
                        {t("table.clearFilters")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    [onRowClick ? "cursor-pointer" : "", rowClassName?.(row.original) ?? ""]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  // Keyboard reaches it too: a row that only opens on a mouse
                  // click is a row somebody using a keyboard cannot open at
                  // all, and the icons this replaced were at least focusable.
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-6 py-2.5 text-sm"
                      // A button inside the row must not also open the row.
                      onClick={
                        cell.column.id === "actions"
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-6 py-3">
        <p className="text-xs text-muted-foreground">
          {totalCount === 0
            ? t("table.showingEmpty")
            : t("table.showing", { from, to, total: totalCount })}
        </p>

        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("table.perPage")}
              className="h-8 rounded-full border-border bg-card text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            disabledReason={
              page <= 1 ? t("common.alreadyFirstPage") : undefined
            }
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="h-8 rounded-full border-border bg-card px-3 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("table.previous")}
          </Button>

          <div className="flex items-center gap-1">
            {pageWindow(page, totalPages).map((entry, index) =>
              entry === null ? (
                <span
                  key={`gap-${index}`}
                  className="px-1 text-xs text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  onClick={() => onPageChange(entry)}
                  className={cn(
                    "tabular h-8 min-w-8 rounded-full px-2 text-xs transition-colors",
                    entry === page
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {entry}
                </button>
              ),
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="h-8 rounded-full border-border bg-card px-3 text-xs"
          >
            {t("table.next")}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Page numbers to show, with `null` marking an elided run.
 *
 * Always keeps the first and last page reachable so jumping to the end of a
 * long list does not require walking through it.
 */
function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  if (current <= 4) return [1, 2, 3, 4, 5, null, total];
  if (current >= total - 3) {
    return [1, null, total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, null, current - 1, current, current + 1, null, total];
}

/** Sortable column header button. */
export function SortableHeader({
  label,
  isSorted,
  onToggle,
}: {
  label: string;
  isSorted: false | "asc" | "desc";
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1 text-xs font-semibold transition-colors hover:text-foreground",
        isSorted ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );
}
