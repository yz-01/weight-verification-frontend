"use client";

/**
 * The office list every contractor module uses (C-020, T-370).
 *
 * Lucas, 2026-09-23, pointing at the material-receipt list (图 4): 「后台的全部
 * 模块的页面状态是和图 4 一模一样的（alignment, design, layout）都是一样，只是
 * 内容不一样」. So the frame is written once - the title with its count, the
 * search, the filters and export in the toolbar, the columns menu, paging, the
 * eye at the end of the row, and a click anywhere on the row to open it - and
 * each module hands in only its columns, its filters and what opening a row
 * shows. `receipts.tsx` is the original this copies; it keeps its own file
 * because it opens a page rather than a dialog.
 *
 * The phone is not this screen. The field app keeps its cards (T-370: 「手机端
 * 不受影响」), which is why each module's workspace takes a `layout` and only the
 * office page asks for the table.
 */

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useListQuery } from "@/hooks/use-list-query";
import type { ProjectCategoryKind } from "@/interfaces/contractor-ops";
import { getProjectCategories } from "@/services/contractor-ops.service";

export function ModuleRecordsTable<T extends { id: string }>({
  title,
  countLabel,
  headerAction,
  above,
  list,
  columns,
  rows,
  totalCount,
  isLoading,
  isError,
  storageKey,
  toolbar,
  onOpen,
  rowClassName,
}: {
  title: string;
  /** "12 records", already in the reader's language. */
  countLabel: string;
  /** The create button, top right, as on the receipt list. */
  headerAction?: React.ReactNode;
  /** Anything between the header and the table (a tab switch, a notice). */
  above?: React.ReactNode;
  list: ReturnType<typeof useListQuery>;
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  /** Where this table remembers which columns the reader hid. */
  storageKey: string;
  /** Filters and export, right of the search box. */
  toolbar?: React.ReactNode;
  /** Open the record: the row, or the eye at its end. */
  onOpen: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
}) {
  const t = useTranslations();
  const withView = useMemo<ColumnDef<T, unknown>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("common.view")}
              onClick={(event) => {
                // The row opens on click too; one open, not two.
                event.stopPropagation();
                onOpen(row.original);
              }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [columns, onOpen, t],
  );

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={title}
        subtitle={isLoading ? "—" : countLabel}
        action={headerAction}
      />
      {above}
      <DataTable
        columns={withView}
        rows={rows}
        totalCount={totalCount}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={isLoading}
        isError={isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey={storageKey}
        toolbarActions={
          toolbar ? <div className="ml-auto flex items-center gap-2">{toolbar}</div> : undefined
        }
        onRowClick={onOpen}
        rowClassName={rowClassName}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}

/** A header the API can sort by; the column id is the `sort_by` it sends. */
export function sortable<T>(label: string): ColumnDef<T, unknown>["header"] {
  return function Header({ column }) {
    return (
      <SortableHeader
        label={label}
        isSorted={column.getIsSorted()}
        onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
      />
    );
  };
}

/** A plain header cell, for a column the API cannot sort by. */
export function PlainHeader({ label }: { label: string }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  );
}

// A Radix SelectItem cannot carry "", so "everything" needs a value of its own.
const ALL = "__all__";
const UNFILED = "__unfiled__";

/** One toolbar filter bound to one list parameter, as on the receipt list. */
export function FilterSelect({
  list,
  param,
  allLabel,
  options,
  width = "w-[160px]",
}: {
  list: ReturnType<typeof useListQuery>;
  param: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  width?: string;
}) {
  return (
    <Select
      value={list.filters[param] ?? ALL}
      onValueChange={(value) => list.setFilter(param, value === ALL ? undefined : value)}
    >
      <SelectTrigger size="sm" className={width} aria-label={allLabel}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The module's own columns (栏目), plus "not filed yet" (T-372).
 *
 * Each module files into its own kind of column (C-020 第 6 条: 「也会归档去不同的
 * 栏目」), so the filter asks for that kind only - offering another module's
 * columns gives options that always return nothing, the T-161 trap. Uses the
 * same two parameters as the receipt list, `category` and `uncategorised`,
 * which every module's list endpoint reads.
 */
export function ColumnFilter({
  list,
  kind,
}: {
  list: ReturnType<typeof useListQuery>;
  kind: ProjectCategoryKind;
}) {
  const t = useTranslations("moduleTable");
  const project = list.filters.project;
  const columns = useQuery({
    queryKey: ["project-categories", "module-columns", kind, project],
    queryFn: () =>
      getProjectCategories({
        page_size: 200,
        // Written out (not shorthand) so the category-kind check can see it;
        // the prop's type already makes it one of the module kinds.
        kind: kind,
        ...(project ? { project } : {}),
      }),
  });
  return (
    <>
      <Select
        value={
          list.filters.category ??
          (list.filters.uncategorised === "true" ? UNFILED : ALL)
        }
        onValueChange={(value) =>
          list.setFilters({
            category: value === ALL || value === UNFILED ? undefined : value,
            uncategorised: value === UNFILED ? "true" : undefined,
          })
        }
      >
        <SelectTrigger size="sm" className="w-[180px]" aria-label={t("allColumns")}>
          <SelectValue placeholder={t("allColumns")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allColumns")}</SelectItem>
          <SelectItem value={UNFILED}>{t("unfiled")}</SelectItem>
          {(columns.data?.results ?? []).map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <QueryFailedNote query={columns} what={t("what.columns")} />
    </>
  );
}

/** Which site, bound to the list's `project` parameter. */
export function ProjectListFilter({ list }: { list: ReturnType<typeof useListQuery> }) {
  const t = useTranslations("moduleTable");
  return (
    <ProjectPicker
      value={list.filters.project ?? ""}
      onValueChange={(next) =>
        list.setFilters({
          project: next === "all" || !next ? undefined : next,
          // A column belongs to one site; keeping it across a site change
          // filters the new site by a column it does not have.
          category: undefined,
          uncategorised: undefined,
        })
      }
      placeholder={t("allProjects")}
      allowAll
      allLabel={t("allProjects")}
      className="h-8 w-[180px]"
    />
  );
}

/**
 * The module's running totals, as one compact line above the table.
 *
 * Kept, not dropped, when the cards became a table: 今天／本月／今年 are part of
 * what several modules were specified to show (8.2.9 for waste, the equipment
 * and progress summaries). A line of chips rather than a row of big tiles, so
 * the table still starts near the top of the screen.
 */
export function SummaryStrip({
  items,
}: {
  items: Array<{ key: string; label: string; value: React.ReactNode; detail?: React.ReactNode }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-baseline gap-2 rounded-md border bg-card px-3 py-1.5">
          <span className="text-xs text-muted-foreground">{item.label}</span>
          <span className="text-sm font-semibold tabular-nums">{item.value}</span>
          {item.detail ? <span className="text-[11px] text-muted-foreground">{item.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}
