"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { useListQuery } from "@/hooks/use-list-query";
import type { CloudService } from "@/interfaces/cloudservice";
import { useDateFormat } from "@/lib/dates";
import { getCloudServices } from "@/services/cloudservice.service";

const STATUS_TONE: Record<string, "positive" | "info" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "positive",
  INACTIVE: "neutral",
  MAINTENANCE: "warning",
  SUSPENDED: "danger",
};

export function CloudServiceList() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery(["status", "type"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cloud-services", list.query],
    queryFn: () => getCloudServices(list.query),
  });

  const columns = useMemo<ColumnDef<CloudService, unknown>[]>(
    () => [
      {
        accessorKey: "service_code",
        meta: { label: t("cloudServices.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("cloudServices.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">{row.original.service_code}</span>
        ),
      },
      {
        accessorKey: "vendor",
        meta: { label: t("cloudServices.field.vendor") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("cloudServices.field.vendor")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="truncate">{row.original.vendor_name}</span>
        ),
      },
      {
        accessorKey: "type",
        meta: { label: t("cloudServices.field.type") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("cloudServices.field.type")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`cloudServices.type.${row.original.type}`)} />
        ),
      },
      {
        accessorKey: "name",
        meta: { label: t("cloudServices.field.name") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("cloudServices.field.name")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="truncate font-medium text-foreground">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("cloudServices.field.status") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("cloudServices.field.status")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`cloudServices.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status] ?? "neutral"}
          />
        ),
      },
      {
        accessorKey: "base_cost",
        meta: { label: t("cloudServices.field.baseCost") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("cloudServices.field.baseCost")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular text-foreground">{row.original.base_cost}</span>
        ),
      },
      {
        accessorKey: "subscription_start",
        meta: { label: t("cloudServices.field.subscriptionStart") },
        header: ({ column }) => (
          <SortableHeader
            label={t("cloudServices.field.subscriptionStart")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.subscription_start)}
          </span>
        ),
      },
    ],
    [df, t],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("cloudServices.title")}
        subtitle={isLoading ? t("common.loading") : t("cloudServices.count", { count: totalCount })}
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
        storageKey="cloud-services"
        filterPills={["ACTIVE", "INACTIVE", "MAINTENANCE", "SUSPENDED"].map((s) => ({
          key: s,
          label: t(`cloudServices.status.${s}`),
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
