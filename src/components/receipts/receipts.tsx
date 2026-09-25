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
import { ListHeader, QueryFailedNote, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIAL_UNITS, type MaterialReceipt } from "@/interfaces/contractor";
import { getProjectCategories } from "@/services/contractor-ops.service";
import { useDateFormat } from "@/lib/dates";
import {
  getReceipts,
  exportReceipts,
  type ExportFormat,
} from "@/services/contractor.service";

// Sentinels rather than "": a Radix SelectItem cannot carry an empty
// value, and the two "no column chosen" answers are different questions -
// every column, versus the ones nobody has filed yet.
const ALL_COLUMNS = "__all__";
const UNFILED = "__unfiled__";
const ALL_STATES = "__any__";

export function Receipts() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(["project", "supplier", "unit", "category", "uncategorised", "acceptance"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipts", list.query],
    queryFn: () => getReceipts(list.query),
  });
  const categories = useQuery({
    queryKey: ["project-categories", "receipt-columns", list.filters.project],
    queryFn: () =>
      getProjectCategories({
        page_size: 200,
        // Filtering deliveries by column offers the columns deliveries can
        // be in. Listing the site-record ones gave options that always
        // returned nothing (T-161).
        kind: "MATERIAL",
        ...(list.filters.project ? { project: list.filters.project } : {}),
      }),
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
        // No read/unread dot (T-292, 客户第 14 条; D-206 removed 「已读」 as a
        // business state). The row says what state the *delivery* is in, not
        // whether this reader has looked at it. The archive queue keeps its own
        // per-person marks (D-063) - that is a different screen and a
        // different question, and it is untouched.
        cell: ({ row }) => (
          <span className="tabular text-foreground">{row.original.receipt_no}</span>
        ),
      },
      {
        id: "acceptance",
        meta: { label: t("receipts.acceptance.title") },
        header: () => t("receipts.acceptance.title"),
        // 「不合格订单留底、可筛选、红字标示…拒绝原因直接显示在列表上」
        // (T-293). The reason sits under the status so nobody has to open the
        // record to learn why a delivery was sent back.
        cell: ({ row }) => {
          const status = row.original.acceptance_status ?? "PENDING";
          return (
            <div className="min-w-0">
              <StatusBadge
                label={t(`receipts.acceptance.status.${status}`)}
                tone={
                  status === "REJECTED"
                    ? "danger"
                    : status === "ACCEPTED"
                      ? "positive"
                      : "warning"
                }
              />
              {status === "REJECTED" && row.original.rejection_reason ? (
                <p className="mt-1 max-w-64 truncate text-xs font-medium text-destructive">
                  {row.original.rejection_reason}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "category_name",
        meta: { label: t("receipts.field.category") },
        header: ({ column }) => (
          <SortableHeader
            label={t("receipts.field.category")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) =>
          row.original.category_name ? (
            <span className="text-foreground">{row.original.category_name}</span>
          ) : (
            // Not an empty cell: "unfiled" is a state somebody has to act on,
            // and a blank reads as a rendering fault rather than a backlog.
            <span className="text-muted-foreground">{t("receipts.unfiled")}</span>
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
      summary: {
        groupBy: "unit",
        title: t("exportTotals.title"),
        unitLabel: t("receipts.field.unit"),
        quantityLabel: t("exportTotals.quantity"),
        note: t("exportTotals.note"),
      },
      columns: [
        { key: "receipt_no", label: t("receipts.field.receiptNo") },
        { key: "captured_at", label: t("receipts.field.capturedAt") },
        { key: "project_code", label: t("receipts.field.project") },
        { key: "supplier_name", label: t("receipts.field.supplier") },
        { key: "category_name", label: t("receipts.field.category") },
        { key: "material_name", label: t("receipts.field.materialName") },
        { key: "quantity", label: t("receipts.field.quantity") },
        { key: "cumulative_quantity", label: t("receipts.field.cumulativeQuantity") },
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
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={list.filters.category ?? (list.filters.uncategorised === "true" ? UNFILED : ALL_COLUMNS)}
              onValueChange={(value) =>
                list.setFilters({
                  category: value === ALL_COLUMNS || value === UNFILED ? undefined : value,
                  uncategorised: value === UNFILED ? "true" : undefined,
                })
              }
            >
              <SelectTrigger size="sm" className="w-[190px]">
                <SelectValue placeholder={t("receipts.allColumns")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COLUMNS}>{t("receipts.allColumns")}</SelectItem>
                <SelectItem value={UNFILED}>{t("receipts.unfiled")}</SelectItem>
                {(categories.data?.results ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={categories} what={t("receipts.what.columns")} />
            {/* By the delivery's own state (T-293, T-295). 已结案 is accepted,
                because acceptance is what closes a receipt - not payment. */}
            <Select
              value={list.filters.acceptance ?? ALL_STATES}
              onValueChange={(value) =>
                list.setFilter("acceptance", value === ALL_STATES ? undefined : value)
              }
            >
              <SelectTrigger size="sm" className="w-[150px]">
                <SelectValue placeholder={t("receipts.allStates")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATES}>{t("receipts.allStates")}</SelectItem>
                <SelectItem value="PENDING">{t("receipts.acceptance.status.PENDING")}</SelectItem>
                <SelectItem value="ACCEPTED">{t("receipts.filter.closed")}</SelectItem>
                <SelectItem value="REJECTED">{t("receipts.filter.rejected")}</SelectItem>
              </SelectContent>
            </Select>
            {can("report.export") ? (
              <ExportButton onExport={runExport} disabled={totalCount === 0} />
            ) : null}
          </div>
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
