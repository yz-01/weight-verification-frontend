"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { useListQuery } from "@/hooks/use-list-query";
import type { Asset, AssetStatus } from "@/interfaces/asset";
import { useDateFormat } from "@/lib/dates";
import { getAssets } from "@/services/asset.service";

const STATUS_TONE: Record<AssetStatus, "positive" | "info" | "warning" | "danger" | "neutral"> = {
  IN_STOCK: "info",
  DEPLOYED: "positive",
  BORROWED: "warning",
  MAINTENANCE: "warning",
  FAULTY: "danger",
  RETIRED: "neutral",
};

export function AssetList() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery(["status", "category"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["assets", list.query],
    queryFn: () => getAssets(list.query),
  });

  const columns = useMemo<ColumnDef<Asset, unknown>[]>(
    () => [
      {
        accessorKey: "asset_code",
        meta: { label: t("assets.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("assets.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">{row.original.asset_code}</span>
        ),
      },
      {
        accessorKey: "category",
        meta: { label: t("assets.field.category") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assets.field.category")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`assets.category.${row.original.category}`)} />
        ),
      },
      {
        accessorKey: "name",
        meta: { label: t("assets.field.name") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assets.field.name")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[row.original.brand, row.original.model].filter(Boolean).join(" · ")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "serial_number",
        meta: { label: t("assets.field.serialNumber") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assets.field.serialNumber")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{row.original.serial_number}</span>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("assets.field.status") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assets.field.status")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`assets.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "deployed_at",
        meta: { label: t("assets.field.deployedAt") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assets.field.deployedAt")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="truncate">{row.original.deployed_company_name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "purchase_date",
        meta: { label: t("assets.field.purchaseDate") },
        header: ({ column }) => (
          <SortableHeader
            label={t("assets.field.purchaseDate")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{df.date(row.original.purchase_date)}</span>
        ),
      },
    ],
    [df, t],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("assets.title")}
        subtitle={isLoading ? t("common.loading") : t("assets.count", { count: totalCount })}
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
        storageKey="assets"
        filterPills={["IN_STOCK", "DEPLOYED", "MAINTENANCE", "FAULTY"].map((s) => ({
          key: s,
          label: t(`assets.status.${s}`),
          active: list.filters.status === s,
          onSelect: () => list.setFilter("status", s),
        }))}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}
