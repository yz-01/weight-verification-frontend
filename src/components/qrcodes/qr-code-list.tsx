"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { useListQuery } from "@/hooks/use-list-query";
import type { QRCode, QRCodeStatus } from "@/interfaces/qrcode";
import { useDateFormat } from "@/lib/dates";
import { getQRCodes } from "@/services/qrcode.service";

const STATUS_TONE: Record<QRCodeStatus, "positive" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "positive",
  DISABLED: "warning",
  VOIDED: "danger",
  EXPIRED: "neutral",
  SUPERSEDED: "neutral",
};

export function QRCodeList() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery(["status", "subject_type"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["qr-codes", list.query],
    queryFn: () => getQRCodes(list.query),
  });

  const columns = useMemo<ColumnDef<QRCode, unknown>[]>(
    () => [
      {
        accessorKey: "serial",
        meta: { label: t("adminQr.field.qrId") },
        header: ({ column }) => (
          <SortableHeader
            label={t("adminQr.field.qrId")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">{row.original.serial}</span>
        ),
      },
      {
        accessorKey: "subject_type",
        meta: { label: t("adminQr.field.subjectType") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("adminQr.field.subjectType")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge
            label={t(`adminQr.subjectType.${row.original.subject_type}`)}
          />
        ),
      },
      {
        accessorKey: "subject_label",
        meta: { label: t("adminQr.field.subject") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("adminQr.field.subject")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="truncate">{row.original.subject_label || "—"}</span>
        ),
      },
      {
        accessorKey: "company",
        meta: { label: t("adminQr.field.company") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("adminQr.field.company")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="truncate">{row.original.company_name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("adminQr.field.status") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("adminQr.field.status")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`adminQr.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "issued_on",
        meta: { label: t("adminQr.field.issuedOn") },
        header: ({ column }) => (
          <SortableHeader
            label={t("adminQr.field.issuedOn")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.issued_on)}
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
        title={t("adminQr.title")}
        subtitle={
          isLoading
            ? t("common.loading")
            : t("adminQr.count", { count: totalCount })
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
        storageKey="qr-codes"
        filterPills={["ACTIVE", "DISABLED", "VOIDED", "EXPIRED"].map((s) => ({
          key: s,
          label: t(`adminQr.status.${s}`),
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
