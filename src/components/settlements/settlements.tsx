"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { Settlement, SettlementState } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { getSettlements } from "@/services/recycler.service";

export const SETTLEMENT_STATE_TONE: Record<
  SettlementState,
  "neutral" | "info" | "positive"
> = {
  DRAFT: "neutral",
  ISSUED: "info",
  LOCKED: "positive",
};

/** Both companies see this list; each sees only its own loads. */
export function Settlements() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery(["state"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settlements", list.query],
    queryFn: () => getSettlements(list.query),
  });

  const columns = useMemo<ColumnDef<Settlement, unknown>[]>(
    () => [
      {
        accessorKey: "settlement_no",
        meta: { label: t("settlements.field.settlementNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("settlements.field.settlementNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.settlement_no}
          </span>
        ),
      },
      {
        accessorKey: "state",
        meta: { label: t("settlements.field.state") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("settlements.field.state")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`settlements.state.${row.original.state}`)}
            tone={SETTLEMENT_STATE_TONE[row.original.state]}
          />
        ),
      },
      {
        accessorKey: "dispatch_no",
        meta: { label: t("settlements.field.dispatchNo") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("settlements.field.dispatchNo")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular truncate">{row.original.dispatch_no}</p>
            <p className="max-w-[180px] truncate text-xs text-muted-foreground">
              {row.original.project_name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "settled_weight_kg",
        meta: { label: t("settlements.field.settledWeight") },
        header: ({ column }) => (
          <SortableHeader
            label={t("settlements.field.settledWeight")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular font-medium text-foreground">
              {row.original.settled_weight_kg}
            </p>
            {Number(row.original.deduction_weight_kg) > 0 && (
              <p className="tabular text-xs text-muted-foreground">
                −{row.original.deduction_weight_kg}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "total_amount",
        meta: { label: t("settlements.field.totalAmount") },
        header: ({ column }) => (
          <SortableHeader
            label={t("settlements.field.totalAmount")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.currency} {row.original.total_amount ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "outstanding",
        meta: { label: t("settlements.field.outstanding") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("settlements.field.outstanding")}
          </span>
        ),
        cell: ({ row }) => {
          const owed = Number(row.original.outstanding ?? 0);
          return (
            <span
              className={
                owed > 0
                  ? "tabular font-medium text-warning"
                  : "tabular text-muted-foreground"
              }
            >
              {row.original.outstanding ?? "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "issued_at",
        meta: { label: t("settlements.field.issuedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("settlements.field.issuedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.issued_at
              ? df.date(row.original.issued_at)
              : t("common.emptyValue")}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("common.view")}
            >
              <Link href={`/settlements/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, df],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("settlements.title")}
        subtitle={
          isLoading ? "—" : t("settlements.count", { count: totalCount })
        }
      />

      <DataTable
        columns={columns}
        rows={data?.results ?? []}
        totalCount={totalCount}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={isLoading}
        isError={isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="settlements"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: (list.filters.state ?? "") === "",
            onSelect: () => list.setFilter("state", undefined),
          },
          ...(["ISSUED", "LOCKED"] as const).map((state) => ({
            key: state,
            label: t(`settlements.state.${state}`),
            active: list.filters.state === state,
            onSelect: () => list.setFilter("state", state),
          })),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}
