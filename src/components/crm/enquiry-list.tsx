"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { useListQuery } from "@/hooks/use-list-query";
import type { CustomerEnquiry, EnquiryStatus } from "@/interfaces/crm";
import { useDateFormat } from "@/lib/dates";
import { getEnquiries } from "@/services/crm.service";

const STATUS_TONE: Record<EnquiryStatus, "positive" | "info" | "warning" | "danger" | "neutral"> = {
  NEW: "info",
  CONTACTED: "info",
  IN_PROGRESS: "warning",
  QUOTED: "warning",
  WON: "positive",
  LOST: "danger",
  CANCELLED: "neutral",
};

export function EnquiryList() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery(["status"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["crm-enquiries", list.query],
    queryFn: () => getEnquiries(list.query),
  });

  const columns = useMemo<ColumnDef<CustomerEnquiry, unknown>[]>(
    () => [
      {
        accessorKey: "enquiry_code",
        meta: { label: t("crm.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("crm.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.enquiry_code}
          </span>
        ),
      },
      {
        accessorKey: "company_name",
        meta: { label: t("crm.field.companyName") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("crm.field.companyName")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.company_name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.contact_person}</p>
          </div>
        ),
      },
      {
        accessorKey: "subject",
        meta: { label: t("crm.field.subject") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("crm.field.subject")}
          </span>
        ),
        cell: ({ row }) => (
          <p className="max-w-[280px] truncate">{row.original.subject}</p>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("crm.field.status") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("crm.field.status")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`crm.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("crm.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("crm.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.created_at)}
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
        title={t("crm.title")}
        subtitle={isLoading ? t("common.loading") : t("crm.count", { count: totalCount })}
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
        storageKey="crm-enquiries"
        filterPills={["NEW", "IN_PROGRESS", "WON", "LOST"].map((s) => ({
          key: s,
          label: t(`crm.status.${s}`),
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
