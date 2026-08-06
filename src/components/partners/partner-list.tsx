"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { useListQuery } from "@/hooks/use-list-query";
import type { Partner, PartnerStatus } from "@/interfaces/partner";
import { useDateFormat } from "@/lib/dates";
import { getPartners } from "@/services/partner.service";

const STATUS_TONE: Record<PartnerStatus, "positive" | "info" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "positive",
  INACTIVE: "neutral",
  SUSPENDED: "warning",
  TERMINATED: "danger",
};

export function PartnerList() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery(["status", "type"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partners", list.query],
    queryFn: () => getPartners(list.query),
  });

  const columns = useMemo<ColumnDef<Partner, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("partners.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("partners.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">{row.original.code}</span>
        ),
      },
      {
        accessorKey: "name",
        meta: { label: t("partners.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("partners.field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.name}</p>
            {row.original.company_name && (
              <p className="truncate text-xs text-muted-foreground">{row.original.company_name}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "type",
        meta: { label: t("partners.field.type") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partners.field.type")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`partners.type.${row.original.type}`)} />
        ),
      },
      {
        accessorKey: "contact_person",
        meta: { label: t("partners.field.contactPerson") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partners.field.contactPerson")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.contact_person}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.contact_phone}</p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("partners.field.status") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partners.field.status")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`partners.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "customers_referred",
        meta: { label: t("partners.field.customersReferred") },
        header: ({ column }) => (
          <SortableHeader
            label={t("partners.field.customersReferred")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{row.original.customers_referred}</span>
        ),
      },
      {
        accessorKey: "partnership_start",
        meta: { label: t("partners.field.partnershipStart") },
        header: ({ column }) => (
          <SortableHeader
            label={t("partners.field.partnershipStart")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.partnership_start)}
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
        title={t("partners.title")}
        subtitle={
          isLoading
            ? t("common.loading")
            : t("partners.count", { count: totalCount })
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
        storageKey="partners"
        filterPills={["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"].map((s) => ({
          key: s,
          label: t(`partners.status.${s}`),
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
