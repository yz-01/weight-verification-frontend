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

import {
  PACK_BADGE_COLUMN,
  PACK_SELECT_COLUMN,
  type PackListConfig,
  usePackList,
  withPackColumns,
} from "@/components/contractor-ops/pack-collect";
import {
  clickOpensRow,
  InsideRowControl,
  keyOpensRow,
  StripFillsWidth,
} from "@/components/shared/inside-row-control";
import { CORRECTED_ROW_CLASS, CorrectedTag } from "@/components/shared/record-correction";
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
  CellFit,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { PAGE_SIZE_OPTIONS } from "@/hooks/use-list-query";
import type { CorrectionHistoryKind } from "@/interfaces/record-correction";
import { defaultVisibility, initialVisibility } from "@/lib/table-fit";
import { cn } from "@/lib/utils";

/** Whether a row says it waits for this reader (`needs_action`, 「待处理」). */
function needsAction(row: unknown): boolean {
  return (
    typeof row === "object" &&
    row !== null &&
    (row as { needs_action?: unknown }).needs_action === true
  );
}

/**
 * A list drawn as cards on a phone (J34-2 point 4): its title columns on the
 * first line, its detail columns small on the second, and its photo strip
 * under them - instead of a table scrolled sideways. Column ids; a hidden
 * column is still shown here when named.
 */
export interface PhoneCard {
  title: readonly string[];
  detail: readonly string[];
  photo?: string;
}

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
  /**
   * Persists column visibility per table. A list that changes its
   * `defaultHidden` bumps the key's version, so a choice saved against the
   * old defaults does not keep the new ones from applying.
   */
  storageKey: string;
  /**
   * Columns hidden until the reader turns them on under 「字段」 - the less used
   * ones a list could not fit on a 1366 px screen (I39, ID80). A reader's own
   * saved choice wins over these.
   */
  defaultHidden?: readonly string[];
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
  /**
   * The list's records can be corrected (J1-3, J1-4, J20): a row whose
   * `was_corrected` is true gets the gold frame and, at the front of its
   * first column, the gold 「已修改」 that opens its history. One place, so
   * the twelve lists show the same mark.
   */
  corrected?: { kind: CorrectionHistoryKind };
  /**
   * The list's records can go into a Multi Engine package (2026-10-10,
   * 添加资料及勾选关联): rows show 「✅ 已打包 X 次」, and while a package is
   * being put together they get tick boxes and 「加入当前资料包」. Written
   * once in `pack-collect.tsx`; a module list only names its kind.
   */
  pack?: PackListConfig<T>;
  /** Cards instead of the table on a phone (J34-2). */
  phoneCard?: PhoneCard;
  onSearchChange: (value: string) => void;
  onSortChange: (field: string, order: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onClearFilters: () => void;
}

/** What only the frame takes: a strip above the rows and a layer after it. */
interface TableFrameProps<T> extends DataTableProps<T> {
  above?: React.ReactNode;
  after?: React.ReactNode;
}

/**
 * The column kept at the right edge (I39): the row's 「查看 / 更改」 buttons,
 * or - on a list without them - its 「查看」 column.
 */
export const PINNED_END_COLUMNS = ["actions", "view"] as const;

/** Columns whose content is a control, never clamped to two lines. */
const UNCLAMPED_COLUMNS = new Set<string>([...PINNED_END_COLUMNS, PACK_SELECT_COLUMN]);

/** The columns whose controls must not also open the row they sit in. */
/** Whether a list row says the office corrected it (I30, J20). */
function isCorrected(row: unknown): boolean {
  return Boolean((row as { was_corrected?: boolean } | null)?.was_corrected);
}

function rowId(row: unknown): string | undefined {
  const id = (row as { id?: unknown } | null)?.id;
  return id == null ? undefined : String(id);
}

const OWN_CLICK_COLUMNS = new Set(["actions", PACK_SELECT_COLUMN, PACK_BADGE_COLUMN]);

/**
 * The table page body: toolbar, one scroll region, pagination footer.
 *
 * The card is a flex column with the body as the only scrolling child, so the
 * toolbar and footer stay pinned while the rows move underneath. Empty, error
 * and loading states render inside the table body rather than replacing it, so
 * the column headers never disappear and the layout never jumps.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  if (props.pack) return <PackedDataTable {...props} pack={props.pack} />;
  return <TableFrame {...props} />;
}

/** A list Multi Engine can pick from: the tick boxes, the badges, the bar. */
function PackedDataTable<T>({
  pack,
  columns,
  rows,
  ...rest
}: DataTableProps<T> & { pack: PackListConfig<T> }) {
  const t = useTranslations("multiEngine.collect");
  const list = usePackList(pack, rows);
  const rowId = (row: T) =>
    pack.rowId ? pack.rowId(row) : String((row as { id?: unknown }).id ?? "");
  return (
    <TableFrame
      {...rest}
      rows={rows}
      columns={withPackColumns(columns, list, t("column"), rowId)}
      above={list.bar}
      after={list.overlay}
    />
  );
}

function TableFrame<T>({
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
  defaultHidden,
  filterPills,
  toolbarActions,
  onRowClick,
  rowClassName,
  corrected,
  phoneCard,
  onSearchChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onClearFilters,
  above,
  after,
}: TableFrameProps<T>) {
  const t = useTranslations();

  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounce(searchDraft, 300);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    defaultVisibility(defaultHidden),
  );

  useEffect(() => {
    if (debouncedSearch !== search) onSearchChange(debouncedSearch);
    // Only the debounced draft should push a change; reacting to `search` here
    // would fight the URL when the browser's back button restores it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Column visibility is a personal preference, not shared state, so it stays
  // in local storage rather than the URL.
  // A list's own defaults (I39) apply until the reader saves a choice.
  const defaultsKey = (defaultHidden ?? []).join(",");
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(`mse.columns.${storageKey}`);
    } catch {
      stored = null;
    }
    const { visibility, corrupt } = initialVisibility(stored, defaultHidden);
    if (corrupt) {
      try {
        window.localStorage.removeItem(`mse.columns.${storageKey}`);
      } catch {
        // storage unavailable: the defaults still apply
      }
    }
    setColumnVisibility(visibility);
    // `defaultsKey` stands for `defaultHidden`, which a page may rebuild on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, defaultsKey]);

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
      try {
        window.localStorage.setItem(
          `mse.columns.${storageKey}`,
          JSON.stringify(next),
        );
      } catch {
        // storage unavailable: the choice holds until the page closes
      }
    },
  });

  const columnCount = table.getVisibleLeafColumns().length;
  const visibleIds = table.getVisibleLeafColumns().map((column) => column.id);
  // Only the row's last column can stay at the edge without covering another.
  const lastId = visibleIds[visibleIds.length - 1];
  const pinnedId = (PINNED_END_COLUMNS as readonly string[]).includes(lastId ?? "")
    ? lastId
    : undefined;
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // Rows to show as cards on a phone; loading, empty and failed stay in the
  // table, which already says so.
  const cards = Boolean(phoneCard) && !isLoading && !isError && rows.length > 0;

  // At least about eight rows tall (Lucas 10/17: with the supplier summary
  // above, the register was squeezed to one row). A page with more above
  // than that scrolls instead.
  return (
    <div className="surface-panel flex min-h-[min(32rem,calc(100dvh-6rem))] min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-xl">
      <div className="shrink-0 border-b border-panel-border">
        {filterPills && filterPills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-6">
            {filterPills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={pill.onSelect}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-10",
                  pill.active
                    ? "border-primary/40 bg-primary/12 text-primary shadow-glow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {pill.active && <Check className="h-3 w-3" />}
                {pill.label}
              </button>
            ))}
          </div>
        )}

        {/*
         * One row on a desktop: search on the left, the page's filters and
         * buttons on the right. On a phone the filters take a full row each
         * and the buttons (导出, 字段) share the last one, instead of each
         * landing wherever the wrap happened to put it. The page's own wrapper
         * div is flattened (`contents`) so its controls line up with 字段.
         */}
        <div
          data-slot="list-toolbar"
          className="flex flex-wrap items-center gap-2 px-4 py-4 sm:px-6"
        >
          <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-52 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={t("common.searchPlaceholder")}
              className="bg-card pl-9"
            />
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:max-w-full sm:justify-end [&>div:not([class*=hidden]):not([role])]:contents max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&>[data-slot=button]]:flex-1 max-sm:[&>input]:w-full">
          {toolbarActions}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontal className="size-4" />
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
      </div>

      {above}

      {/* The table's own box is the one that scrolls (IB3): its header is
          sticky against it, and it fills what the panel leaves. */}
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", cards && "max-sm:hidden")}>
        <Table fit containerClassName="min-h-0 flex-1" className="w-full max-sm:min-w-max max-sm:[&_tbody_td:first-child]:sticky max-sm:[&_tbody_td:first-child]:left-0 max-sm:[&_tbody_td:first-child]:z-[1] max-sm:[&_tbody_td:first-child]:bg-card max-sm:[&_thead_th:first-child]:sticky max-sm:[&_thead_th:first-child]:left-0 max-sm:[&_thead_th:first-child]:z-[2] max-sm:[&_thead_th:first-child]:bg-card">
          <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:bg-transparent">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    pin={header.column.id === pinnedId ? "end" : undefined}
                    className="h-11 px-4 text-xs font-semibold text-muted-foreground"
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

          {/* A row that opens on click is the control: a thumbnail inside
              it is a picture, not a second button (audit #11). */}
          <InsideRowControl.Provider value={Boolean(onRowClick)}>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {Array.from({ length: columnCount }).map((__, cellIndex) => (
                    <TableCell key={`skeleton-cell-${cellIndex}`} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-40" />
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
                  // A row the sidebar's number counts (「待处理」, 2026-10-09)
                  // carries a stripe on its first cell as well as its pill
                  // by the buttons: on a phone the first column is the one
                  // that stays in view while the row scrolls sideways.
                  data-needs-action={needsAction(row.original) ? "true" : undefined}
                  className={
                    [
                      onRowClick ? "cursor-pointer" : "",
                      needsAction(row.original)
                        ? "[&>td:first-child]:border-l-4 [&>td:first-child]:border-l-primary"
                        : "",
                      rowClassName?.(row.original) ?? "",
                      corrected && isCorrected(row.original) ? CORRECTED_ROW_CLASS : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  // Keyboard reaches it too: a row that only opens on a mouse
                  // click is a row somebody using a keyboard cannot open at
                  // all, and the icons this replaced were at least focusable.
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  onClick={
                    onRowClick
                      ? (event) => {
                          if (clickOpensRow(event)) onRowClick(row.original);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (keyOpensRow(event)) {
                            event.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell, index, cells) => (
                    <TableCell
                      key={cell.id}
                      pin={cell.column.id === pinnedId ? "end" : undefined}
                      className="px-4 py-2.5 text-sm"
                      // A button inside the row must not also open the row.
                      onClick={
                        OWN_CLICK_COLUMNS.has(cell.column.id)
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                      // Space on a tick box ticks it; it does not open the row.
                      onKeyDown={
                        cell.column.id === PACK_SELECT_COLUMN || cell.column.id === PACK_BADGE_COLUMN
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                    >
                      {corrected &&
                      isCorrected(row.original) &&
                      cell.id === cells.find((one) => one.column.id !== PACK_SELECT_COLUMN)?.id ? (
                        // 「已修改」 at the very front of the row (J1-4).
                        <div className="flex items-center gap-1.5">
                          <CorrectedTag kind={corrected.kind} recordId={rowId(row.original)} />
                          <div className="min-w-0">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </div>
                      ) : UNCLAMPED_COLUMNS.has(cell.column.id) ? (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      ) : (
                        // Two lines at most, the whole text on hover (I39).
                        <CellFit>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </CellFit>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          </InsideRowControl.Provider>
        </Table>
      </div>
      {cards && phoneCard ? (
        <InsideRowControl.Provider value={Boolean(onRowClick)}>
          <ul data-phone-cards className="min-h-0 flex-1 divide-y divide-panel-border overflow-y-auto sm:hidden">
            {table.getRowModel().rows.map((row) => {
              const byId = new Map(row.getAllCells().map((cell) => [cell.column.id, cell]));
              const draw = (id: string) => {
                const cell = byId.get(id);
                return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
              };
              const open = onRowClick ? () => onRowClick(row.original) : undefined;
              return (
                <li
                  key={row.id}
                  data-needs-action={needsAction(row.original) ? "true" : undefined}
                  tabIndex={open ? 0 : undefined}
                  role={open ? "button" : undefined}
                  onClick={
                    open
                      ? (event) => {
                          if (clickOpensRow(event)) open();
                        }
                      : undefined
                  }
                  onKeyDown={
                    open
                      ? (event) => {
                          if (keyOpensRow(event)) {
                            event.preventDefault();
                            open();
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    "space-y-2 px-4 py-3",
                    open && "cursor-pointer active:bg-muted/60",
                    needsAction(row.original) && "border-l-4 border-l-primary",
                    rowClassName?.(row.original),
                    corrected && isCorrected(row.original) && CORRECTED_ROW_CLASS,
                  )}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                    {corrected && isCorrected(row.original) ? (
                      <CorrectedTag kind={corrected.kind} recordId={rowId(row.original)} />
                    ) : null}
                    {phoneCard.title.map((id) => (
                      <span key={id} className="min-w-0 truncate">
                        {draw(id)}
                      </span>
                    ))}
                  </div>
                  {phoneCard.detail.length > 0 ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {phoneCard.detail.map((id) => (
                        <span key={id} className="min-w-0 truncate">
                          {draw(id)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {phoneCard.photo ? (
                    <StripFillsWidth.Provider value>
                      <div>{draw(phoneCard.photo)}</div>
                    </StripFillsWidth.Provider>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </InsideRowControl.Provider>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-panel-border px-4 py-3 sm:px-6">
        <p className="text-xs text-muted-foreground">
          {totalCount === 0
            ? t("table.showingEmpty")
            : t("table.showing", { from, to, total: totalCount })}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("table.perPage")}
              className="h-9 rounded-full border-border bg-card text-xs pointer-coarse:h-10"
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
            className="h-9 rounded-full border-border bg-card px-3 text-xs pointer-coarse:h-10"
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
                    "tabular h-9 min-w-9 rounded-full px-2 text-xs transition-colors pointer-coarse:h-10 pointer-coarse:min-w-10",
                    entry === page
                      ? "bg-primary text-primary-foreground shadow-glow-sm"
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
            className="h-9 rounded-full border-border bg-card px-3 text-xs pointer-coarse:h-10"
          >
            {t("table.next")}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {after}
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
