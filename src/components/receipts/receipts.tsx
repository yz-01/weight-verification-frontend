"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Eye, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListNeedsActionChip, withNeedsActionColumn } from "@/components/shared/needs-action";
import { ExportButton } from "@/components/shared/export-button";
import { photoColumn, recordPhotos } from "@/components/shared/photo-thumb";
import { RecordNo } from "@/components/shared/record-no";
import { SupplierDateListFilter } from "@/components/shared/supplier-date-filter";
import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type MaterialReceipt } from "@/interfaces/contractor";
import { ManufacturerCell } from "@/components/shared/manufacturer-picker";
import { useUnitExportValues, useUnitName } from "@/hooks/use-material-units";
import { useDateFormat } from "@/lib/dates";
import { getProjectCategories } from "@/services/contractor-ops.service";
import {
  getReceipts,
  exportReceipts,
  type ExportFormat,
} from "@/services/contractor.service";
import { MaterialTabs, NetTotalsView, useMaterialTab } from "@/components/receipts/material-tabs";

// Sentinels rather than "": a Radix SelectItem cannot carry an empty
// value, and the two "no column chosen" answers are different questions -
// every column, versus the ones nobody has filed yet.
const ALL_COLUMNS = "__all__";
const UNFILED = "__unfiled__";
const ALL_STATES = "__any__";

export function Receipts() {
  const t = useTranslations();
  const { can } = useAuth();
  const list = useListQuery([
    "project",
    "supplier",
    "manufacturer",
    "date_from",
    "date_to",
    "unit",
    "category",
    "uncategorised",
    "acceptance",
    "direction",
    "view",
  ]);
  // 材料管理's tabs (B09): Material In is what counts - deliveries not
  // rejected; Reject is the rejected ones; a return typed 退场 before 10-02
  // shows under Material Out (direction=OUT).
  const tab = useMaterialTab();
  const query = useMemo(() => {
    const { view, ...rest } = list.query as Record<string, string | number | undefined>;
    void view;
    if (tab === "reject") return { ...rest, direction: undefined };
    if (tab === "out") return { ...rest, direction: "OUT", acceptance: undefined };
    return { ...rest, direction: "IN" };
  }, [list.query, tab]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipts", query],
    queryFn: () => getReceipts(query),
    enabled: tab !== "totals",
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

  const unitName = useUnitName();
  const unitValues = useUnitExportValues();
  const df = useDateFormat();
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
        // The short number big, the project small (2026-10 D4); the whole
        // number on hover, long press, or copied.
        cell: ({ row }) => (
          <RecordNo value={row.original.receipt_no} projectCode={row.original.project_code} />
        ),
      },
      // The delivery's day and time back on the list (Lucas, 2026-10-09:
      // 「材料进场没有日期显示」), C13 having taken 记录时间 off it. The same
      // date the detail shows: the delivery's own (`business_at`), which a
      // correction keeps, falling back to the platform's stamp. Sorted by the
      // server on the same field, which is also what the date filter reads.
      {
        accessorKey: "business_at",
        meta: { label: t("receipts.field.businessAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("receipts.field.businessAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap text-muted-foreground">
            {df.dateTime(row.original.business_at ?? row.original.captured_at)}
          </span>
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
            className="block max-w-50 truncate font-medium text-foreground"
            title={row.original.material_name}
          >
            {row.original.material_name}
          </span>
        ),
      },
      // The delivery's photograph, between 材料 and 数量 as the client drew
      // it (E3): the arrival photo before the DO's, opened on click.
      photoColumn<MaterialReceipt>({
        label: t("moduleTable.photos"),
        icon: ClipboardList,
        reference: (row) => row.receipt_no,
        photos: (row) => recordPhotos("MATERIAL_RECEIPT", row.id, row.receipt_no),
      }),
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
            {row.original.quantity} {unitName(row.original.unit, row.original.unit_label)}
          </span>
        ),
      },
      {
        accessorKey: "supplier_name",
        meta: { label: t("receipts.field.supplier") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("receipts.field.supplier")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-45 truncate"
            title={row.original.supplier_name}
          >
            {row.original.supplier_name}
          </span>
        ),
      },
      // Whose make (2026-10 D1), orange 「非指定厂商」 when the category
      // designates others.
      {
        accessorKey: "manufacturer_name",
        meta: { label: t("receipts.field.manufacturer") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("receipts.field.manufacturer")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="block max-w-50">
            <ManufacturerCell
              name={row.original.manufacturer_name}
              offList={row.original.manufacturer_off_list}
            />
          </span>
        ),
      },
      // 项目 left the list (2026-10 C13): it is the one chosen at the top.
      // What the office matches a delivery against took its place - the DO
      // and the lorry. The day came back beside the number (2026-10-09).
      {
        accessorKey: "delivery_note_no",
        meta: { label: t("receipts.field.deliveryNoteNo") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("receipts.field.deliveryNoteNo")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular block max-w-35 truncate" title={row.original.delivery_note_no ?? ""}>
            {row.original.delivery_note_no || "—"}
          </span>
        ),
      },
      {
        accessorKey: "vehicle_plate",
        meta: { label: t("receipts.field.vehiclePlate") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("receipts.field.vehiclePlate")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap">{row.original.vehicle_plate || "—"}</span>
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
    [t, can, unitName, df],
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
      query,
      // Material In prints received and returned per material,
      // specification and unit under the rows (B09); no net since
      // 2026-10-10 (Lucas: 「不需要进场减退场」).
      summary:
        tab === "in"
          ? {
              groupBy: "material",
              title: t("receipts.net.title"),
              unitLabel: t("receipts.field.unit"),
              quantityLabel: t("exportTotals.quantity"),
              note: t("receipts.net.note"),
              materialLabel: t("receipts.field.materialName"),
              specificationLabel: t("receipts.field.materialSpecification"),
              receivedLabel: t("receipts.net.received"),
              returnedLabel: t("receipts.net.returned"),
            }
          : {
              groupBy: "unit",
              title: t("exportTotals.title"),
              unitLabel: t("receipts.field.unit"),
              quantityLabel: t("exportTotals.quantity"),
              note: t("exportTotals.note"),
            },
      columns: [
        { key: "receipt_no", label: t("receipts.field.receiptNo") },
        { key: "business_at", label: t("receipts.field.businessAt") },
        { key: "project_code", label: t("receipts.field.project") },
        { key: "supplier_name", label: t("receipts.field.supplier") },
        { key: "manufacturer_name", label: t("receipts.field.manufacturer") },
        { key: "category_name", label: t("receipts.field.category") },
        {
          key: "movement_type",
          label: t("receipts.field.movementType"),
          values: { ENTRY: t("receipts.movement.ENTRY"), RETURN: t("receipts.movement.RETURN") },
        },
        { key: "material_name", label: t("receipts.field.materialName") },
        { key: "material_specification", label: t("receipts.field.materialSpecification") },
        { key: "quantity", label: t("receipts.field.quantity") },
        { key: "cumulative_quantity", label: t("receipts.field.cumulativeQuantity") },
        {
          key: "unit",
          label: t("receipts.field.unit"),
          values: unitValues,
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
        // No 「记录材料进场」 here (2026-10 A1, X9): a delivery is recorded on
        // the phone at the gate, and the office corrects it from its detail.
        // 「待处理 N」: deliveries 待验收 for this reader, the sidebar's
        // number for 材料进场 (2026-10-09).
        action={<ListNeedsActionChip list={list} count={data?.needs_action_count} />}
      />

      <MaterialTabs>
        <SupplierDateListFilter list={list} showManufacturer />
      </MaterialTabs>
      {tab === "totals" ? (
        <NetTotalsView
          project={list.filters.project}
          filters={{
            supplier: list.filters.supplier,
            manufacturer: list.filters.manufacturer,
            date_from: list.filters.date_from,
            date_to: list.filters.date_to,
          }}
        />
      ) : (
      <DataTable
        columns={withNeedsActionColumn(columns, t("needsAction.column"))}
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
        // `.v2` since the columns changed (2026-10 C13): a reader's saved
        // choice of the old columns would otherwise hide the DO and plate.
        // `.v3` with the manufacturer column (2026-10 D1); `.v4` with the
        // photograph in place of the photo count (E3).
        storageKey="receipts.v4"
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
              <SelectTrigger className="w-full sm:w-48">
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
            {tab === "in" && (
            <Select
              value={list.filters.acceptance ?? ALL_STATES}
              onValueChange={(value) =>
                list.setFilter("acceptance", value === ALL_STATES ? undefined : value)
              }
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t("receipts.allStates")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATES}>{t("receipts.allStates")}</SelectItem>
                <SelectItem value="PENDING">{t("receipts.acceptance.status.PENDING")}</SelectItem>
                <SelectItem value="ACCEPTED">{t("receipts.filter.closed")}</SelectItem>
              </SelectContent>
            </Select>
            )}
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
      )}
    </div>
  );
}
