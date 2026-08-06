"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { useListQuery } from "@/hooks/use-list-query";
import type { Salesperson } from "@/interfaces/sales";
import { useDateFormat } from "@/lib/dates";
import { getSalespeople } from "@/services/sales.service";

export function SalespersonList() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["salespeople", list.query],
    queryFn: () => getSalespeople(list.query),
  });

  const columns = useMemo<ColumnDef<Salesperson, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("sales.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("sales.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: "full_name",
        meta: { label: t("sales.field.fullName") },
        header: ({ column }) => (
          <SortableHeader
            label={t("sales.field.fullName")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-[220px] truncate font-medium text-foreground"
              title={row.original.full_name}
            >
              {row.original.full_name}
            </p>
            <p className="max-w-[220px] truncate text-xs text-muted-foreground">
              {row.original.email || t("common.emptyValue")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "sales_role",
        meta: { label: t("sales.field.salesRole") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sales.field.salesRole")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`sales.role.${row.original.sales_role}`)} />
        ),
      },
      {
        accessorKey: "supervisor",
        meta: { label: t("sales.field.supervisor") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sales.field.supervisor")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.supervisor_name ?? t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "commission_scheme",
        meta: { label: t("sales.field.commissionScheme") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sales.field.commissionScheme")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.scheme_name ?? t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "joined_on",
        meta: { label: t("sales.field.joinedOn") },
        header: ({ column }) => (
          <SortableHeader
            label={t("sales.field.joinedOn")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.joined_on)}
          </span>
        ),
      },
      {
        accessorKey: "is_active",
        meta: { label: t("sales.field.status") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sales.field.status")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={
              row.original.is_active
                ? t("common.active")
                : t("common.inactive")
            }
            tone={row.original.is_active ? "positive" : "neutral"}
          />
        ),
      },
    ],
    [df, t],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("sales.title")}
        subtitle={
          isLoading
            ? t("common.loading")
            : t("sales.count", { count: totalCount })
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
        storageKey="salespeople"
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}
