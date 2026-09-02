"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, MapPin, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { ListHeader, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import { MATERIAL_UNITS, type MaterialReceipt } from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import {
  getReceipts,
  exportReceipts,
  type ExportFormat,
} from "@/services/contractor.service";

export function Receipts() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(["project", "supplier", "unit"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipts", list.query],
    queryFn: () => getReceipts(list.query),
  });

  const columns = useMemo<ColumnDef<MaterialReceipt, unknown>[]>(
    () => [
      {
        accessorKey: "receipt_no",
        meta: { label: t("receipts.field.receiptNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("receipts.field.receiptNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.receipt_no}
          </span>
        ),
      },
      {
        accessorKey: "captured_at",
        meta: { label: t("receipts.field.capturedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("receipts.field.capturedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="tabular text-muted-foreground">
              {df.date(row.original.captured_at)}
            </span>
            {row.original.has_location && (
              <MapPin
                className="h-3 w-3 text-success"
                aria-label={t("receipts.locationCaptured")}
              />
            )}
          </div>
        ),
      },
      {
        accessorKey: "material_name",
        meta: { label: t("receipts.field.materialName") },
        header: ({ column }) => (
          <SortableHeader
            label={t("receipts.field.materialName")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[200px] truncate font-medium text-foreground"
            title={row.original.material_name}
          >
            {row.original.material_name}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        meta: { label: t("receipts.field.quantity") },
        header: ({ column }) => (
          <SortableHeader
            label={t("receipts.field.quantity")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.quantity} {t(`receipts.unit.${row.original.unit}`)}
          </span>
        ),
      },
      {
        accessorKey: "supplier_name",
        meta: { label: t("receipts.field.supplier") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("receipts.field.supplier")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate"
            title={row.original.supplier_name}
          >
            {row.original.supplier_name}
          </span>
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("receipts.field.project") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("receipts.field.project")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[180px] truncate">{row.original.project_name}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {row.original.project_code}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "photo_count",
        meta: { label: t("receipts.field.photoCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("receipts.field.photoCount")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.photo_count ?? 0)} />
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
              <Link href={`/receipts/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {/*
              No bin. A filed receipt is evidence and the backend has always
              refused to delete one - the button that used to sit here promised
              the row would leave the material totals and returned 409 every
              time it was pressed (F-129). Correcting supersedes instead.
            */}
            {can("receipt.update") && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={t("receipts.editTitle")}
              >
                <Link href={`/receipts/${row.original.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, can, df],
  );

  const totalCount = data?.count ?? 0;

  /**
   * The export's wording, resolved here rather than on the server.
   *
   * The backend holds no message catalogue — one copy of the translations, in
   * one place. It is handed the headings and the unit names already in the
   * reader's language, and fills in the rows.
   */
  function runExport(format: ExportFormat) {
    return exportReceipts({
      format,
      title: t("receipts.title"),
      subtitle: t("receipts.count", { count: totalCount }),
      emptyLabel: t("table.noResults"),
      query: list.query,
      columns: [
        { key: "receipt_no", label: t("receipts.field.receiptNo") },
        { key: "captured_at", label: t("receipts.field.capturedAt") },
        { key: "project_code", label: t("receipts.field.project") },
        { key: "supplier_name", label: t("receipts.field.supplier") },
        { key: "material_name", label: t("receipts.field.materialName") },
        { key: "quantity", label: t("receipts.field.quantity") },
        {
          key: "unit",
          label: t("receipts.field.unit"),
          values: Object.fromEntries(
            MATERIAL_UNITS.map((unit) => [unit, t(`receipts.unit.${unit}`)]),
          ),
        },
        { key: "unit_price", label: t("receipts.field.unitPrice") },
        { key: "total_value", label: t("receipts.field.totalValue") },
        { key: "vehicle_plate", label: t("receipts.field.vehiclePlate") },
        { key: "delivery_note_no", label: t("receipts.field.deliveryNoteNo") },
        { key: "received_by_name", label: t("receipts.field.receivedBy") },
      ],
    });
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("receipts.title")}
        subtitle={isLoading ? "—" : t("receipts.count", { count: totalCount })}
        action={
          can("receipt.create") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/receipts/create">
                <Plus className="h-4 w-4" />
                {t("receipts.new")}
              </Link>
            </Button>
          ) : undefined
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
        storageKey="receipts"
        toolbarActions={
          can("report.export") ? (
            <ExportButton onExport={runExport} disabled={totalCount === 0} />
          ) : undefined
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

    </div>
  );
}
