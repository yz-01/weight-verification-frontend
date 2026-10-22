"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FilterX,
  Package,
  ReceiptText,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { CompanyBanner } from "@/components/dashboard/company-banner";
import { ExportButton } from "@/components/shared/export-button";
import { PhotoStrip, recordPhotos } from "@/components/shared/photo-thumb";
import {
  ReportChoiceField,
  ReportKeywordField,
} from "@/components/reports/report-filter-bar";
import { ReportSelector, useMaterialColumns } from "@/components/reports/report-selector";
import { FilterBar, FilterField, ListHeader, QueryFailedNote, TypeBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { ViewReceipt } from "@/components/receipts/view-receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAGE_SIZE_OPTIONS, useListQuery } from "@/hooks/use-list-query";
import { type MaterialReceipt } from "@/interfaces/contractor";
import { ManufacturerCell, anyNamedManufacturer } from "@/components/shared/manufacturer-picker";
import { SpecFilterSelect } from "@/components/shared/spec-filter";
import { SupplierDateFilter } from "@/components/shared/supplier-date-filter";
import { useUnitExportValues, useUnitName } from "@/hooks/use-material-units";
import { useDateFormat } from "@/lib/dates";
import { materialExportSubtitle, materialOptions } from "@/lib/report-menu";
import { UNFILLED_SUPPLIER, supplierShown } from "@/lib/receipt-supplier";
import { cn } from "@/lib/utils";
import {
  exportMaterialReportReturns,
  getMaterialReportReturns,
} from "@/services/contractor-ops.service";
import {
  exportReceipts,
  getReceipts,
  getReceiptSummary,
  type ExportFormat,
} from "@/services/contractor.service";

export type MaterialReportMode = "quantity" | "cost";

/**
 * 材料数量报表's three views (J36): the normal deliveries, the rejected ones
 * (不合格材料) and the returns (材料退场 / 退货). Nothing chosen = normal.
 */
export type MaterialReportView = "normal" | "rejected" | "returns";

export function viewOf(value: string | undefined): MaterialReportView {
  return value === "rejected" || value === "returns" ? value : "normal";
}

/**
 * The view the report asks the server for. Always named - `normal` too - so
 * the deliveries listed and exported leave the rejected ones out, matching
 * the figures above them; 材料管理 sends none and keeps every delivery. The
 * cost report has only the normal view.
 */
export function reportModeParam(
  mode: MaterialReportMode,
  value: string | undefined,
): MaterialReportView {
  return mode === "quantity" ? viewOf(value) : "normal";
}

const hintKey: Record<MaterialReportView, string> = {
  normal: "cumulativeHint",
  rejected: "rejectedHint",
  returns: "returnsHint",
};

export function MaterialReport({ mode }: { mode: MaterialReportMode }) {
  const t = useTranslations();
  const { can } = useAuth();
  // `category` and `supplier` are the 【选择报表】 levels under the report
  // (B04): the figures, the records, their photos and the export all read
  // them from the address, so one choice updates all four together.
  // The filter bar (2026-10-10, 图11) adds the supplier and material as
  // choices of their own, 验收 and a keyword - the list's `search`, which
  // the figures, the deliveries and the export all read.
  const list = useListQuery([
    "project", "date_from", "date_to", "category", "spec_category", "supplier", "report_mode",
  ]);
  const view = reportModeParam(mode, list.filters.report_mode);
  const topBar = useCurrentProject();
  const projectBoxShown = can("project.view") && !topBar.active;
  const filters = {
    project: list.filters.project,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
    category: list.filters.category,
    // One specification of the material (I11, I19): the figures, the records
    // and the export all follow it.
    spec_category: list.filters.spec_category,
    supplier: list.filters.supplier,
    // 不合格 / 退货 view (J36): the figures, the records and the export.
    // The normal view is sent as well, or the list and the export would
    // still carry the rejected deliveries the figures leave out.
    report_mode: view,
    search: list.search || undefined,
  };
  const unitValues = useUnitExportValues();
  // A delivery with no supplier yet prints 「未填供应商」 (I23).
  const unfilledSupplierValues = { "": t("receipts.supplierUnfilled") };

  const summary = useQuery({
    queryKey: ["receipts", "summary", mode, filters],
    queryFn: () => getReceiptSummary(filters),
  });
  // The rows under the figures start with them, not after them: waiting for
  // the figures before asking for the rows made every open and every filter
  // two round trips long (报表中心 speed, 2026-10-22).
  const deliveries = useDeliveryRecords(filters, list.page, list.pageSize, view !== "returns");
  const returnRows = useReturnRecords(filters, list.page, list.pageSize, view === "returns");
  const columns = useMaterialColumns(filters.project);
  // A failed column list leaves the figures right and only the name unknown.
  const materialName = filters.category
    ? columns.isError
      ? t("common.emptyValue")
      : columns.data?.results.find((row) => row.id === filters.category)?.name
    : t("reportSelector.allMaterials");
  // 「未填供应商」 (2026-10-15 I23) is a level of its own: `supplier=none`.
  const supplierName = !filters.supplier
    ? t("reportSelector.allSuppliers")
    : filters.supplier === UNFILLED_SUPPLIER
      ? t("receipts.supplierUnfilled")
      : summary.data?.by_supplier.find((row) => row.supplier === filters.supplier)?.supplier_name;
  const specName = filters.spec_category
    ? columns.isError
      ? t("common.emptyValue")
      : columns.isSuccess
        // A specification that is switched off is no longer in the list.
        ? (columns.data.results.find((row) => row.id === filters.spec_category)?.name ??
          t("reportSelector.specOff"))
        : undefined
    : undefined;
  const level = [
    materialName ?? "…",
    ...(filters.spec_category ? [specName ?? "…"] : []),
    supplierName ?? "…",
  ].join(" › ");
  const viewTitle =
    mode === "quantity" && view !== "normal"
      ? `${t(`materialReports.${mode}.title`)} - ${t(`materialReports.view.${view}`)}`
      : t(`materialReports.${mode}.title`);
  const chosen = [viewTitle, level].join(" › ");

  function runExport(format: ExportFormat) {
    // The file ends with each material's 累计总数量 (E5, Q24): one
    // quantity beside 收货次数, as on the screen (Lucas 2026-10-10).
    const cumulativeSummary = {
              groupBy: "material_cumulative" as const,
              title: t("materialReports.export.cumulativeTitle"),
              materialLabel: t("reports.receipts.material"),
              specificationLabel: t("receipts.field.materialSpecification"),
              unitLabel: t("reports.receipts.unit"),
              quantityLabel: t("receipts.field.cumulativeQuantity"),
              countLabel: t("reports.receipts.deliveries"),
              note: t(`materialReports.quantity.${hintKey[view]}`),
            };
    if (view === "returns") {
      // 退货 view (J36): the returns, from their own endpoint.
      return exportMaterialReportReturns({
        format,
        title: viewTitle,
        subtitle: materialExportSubtitle(t, {
          level,
          dateFrom: filters.date_from,
          dateTo: filters.date_to,
        }),
        emptyLabel: t("table.noResults"),
        query: filters,
        summary: cumulativeSummary,
        columns: [
              { key: "return_note_no", label: t("materialReports.records.returnNo") },
              { key: "processed_at", label: t("materialReports.records.returnedAt") },
              { key: "project_name", label: t("receipts.field.project") },
              { key: "supplier_name", label: t("receipts.field.supplier"), values: unfilledSupplierValues },
              { key: "source_receipt_no", label: t("materialReports.records.sourceReceipt") },
              { key: "delivery_note_no", label: t("receipts.field.deliveryNoteNo") },
              { key: "vehicle_plate", label: t("receipts.field.vehiclePlate") },
              { key: "material_name", label: t("receipts.field.materialName") },
              { key: "material_specification", label: t("receipts.field.spec") },
              { key: "returned_quantity", label: t("materialReports.records.returnedQuantity") },
              { key: "unit", label: t("receipts.field.unit"), values: unitValues },
              { key: "reason", label: t("materialReports.records.reason") },
      ],
      });
    }
    return exportReceipts({
      format,
      title: viewTitle,
      // What the file was narrowed to: the period and the level (B3 #15).
      subtitle: materialExportSubtitle(t, {
        level,
        dateFrom: filters.date_from,
        dateTo: filters.date_to,
      }),
      emptyLabel: t("table.noResults"),
      query: filters,
      // The file ends with each material's 累计总数量 (E5, Q24): one
      // quantity beside 收货次数, as on the screen (Lucas 2026-10-10).
      summary: mode === "quantity" ? cumulativeSummary : undefined,
      columns:
        mode === "quantity"
          ? [
              { key: "receipt_no", label: t("receipts.field.receiptNo") },
              { key: "captured_at", label: t("receipts.field.capturedAt") },
              { key: "project_code", label: t("receipts.field.project") },
              { key: "supplier_name", label: t("receipts.field.supplier"), values: unfilledSupplierValues },
              // DO and plate head every delivery (2026-10 C12).
              { key: "delivery_note_no", label: t("receipts.field.deliveryNoteNo") },
              { key: "vehicle_plate", label: t("receipts.field.vehiclePlate") },
              { key: "manufacturer_name", label: t("receipts.field.manufacturer") },
              { key: "material_name", label: t("receipts.field.materialName") },
              { key: "material_specification", label: t("receipts.field.spec") },
              // One quantity per delivery; the sum is the closing section's
              // 累计数量 (Lucas 2026-10-10: 「保留一个就好了」).
              { key: "quantity", label: t("receipts.field.quantity") },
              {
                key: "unit",
                label: t("receipts.field.unit"),
                values: unitValues,
              },
              // 不合格 view: why each load was turned away (J36).
              ...(view === "rejected"
                ? [{ key: "rejection_reason", label: t("materialReports.records.reason") }]
                : []),
            ]
          : [
              { key: "receipt_no", label: t("receipts.field.receiptNo") },
              { key: "captured_at", label: t("receipts.field.capturedAt") },
              { key: "project_code", label: t("receipts.field.project") },
              { key: "supplier_name", label: t("receipts.field.supplier"), values: unfilledSupplierValues },
              // DO and plate head every delivery (2026-10 C12).
              { key: "delivery_note_no", label: t("receipts.field.deliveryNoteNo") },
              { key: "vehicle_plate", label: t("receipts.field.vehiclePlate") },
              { key: "manufacturer_name", label: t("receipts.field.manufacturer") },
              { key: "material_name", label: t("receipts.field.materialName") },
              { key: "material_specification", label: t("receipts.field.spec") },
              { key: "quantity", label: t("receipts.field.quantity") },
              {
                key: "unit",
                label: t("receipts.field.unit"),
                values: unitValues,
              },
              { key: "unit_price", label: t("receipts.field.unitPrice") },
              { key: "total_value", label: t("receipts.field.totalValue") },
            ],
    });
  }

  return (
    <div className="space-y-4">
      <CompanyBanner scope="reports" />
      <ReportSelector summary={chosen} />
      <ListHeader
        title={t(`materialReports.${mode}.title`)}
        subtitle={t(`materialReports.${mode}.subtitle`)}
        action={can("report.export") ? (
          <ExportButton
            disabled={summary.isLoading || (summary.data?.total_receipts ?? 0) === 0}
            onExport={runExport}
          />
        ) : undefined}
      />

      <FilterBar>
        {/* Not beside the top bar's 「当前项目」, which is this filter (B13). */}
        {projectBoxShown && (
          <FilterField label={t("reports.filter.project")} className="sm:w-64">
            <ProjectPicker
              value={list.filters.project ?? "all"}
              onValueChange={(value) =>
                list.setFilter("project", value === "all" ? undefined : value)
              }
              placeholder={t("reports.filter.project")}
              allowAll
              allLabel={t("reports.filter.allProjects")}
              className="w-full"
            />
          </FilterField>
        )}
        <FilterField label={t("receipts.field.supplier")} className="sm:w-52">
          <SupplierDateFilter
            value={{ supplier: list.filters.supplier }}
            onChange={(next) => list.setFilter("supplier", next.supplier)}
            showDates={false}
            showUnfilled
          />
        </FilterField>
        <ReportChoiceField
          label={t("reportSelector.material")}
          value={list.filters.category}
          options={materialOptions(columns.data?.results ?? [])}
          // A specification belongs to one material: choosing another drops it.
          onChange={(category) => list.setFilters({ category, spec_category: undefined })}
          loading={columns.isLoading}
        />
        {/* 规格 (J2-3, Q2-2): one specification of the chosen material. */}
        <FilterField label={t("specFilter.label")} className="sm:w-44">
          <SpecFilterSelect
            material={columns.data?.results.find((row) => row.id === list.filters.category)}
            value={list.filters.spec_category}
            onChange={(spec) => list.setFilter("spec_category", spec)}
            className="sm:w-full"
          />
        </FilterField>
        <FilterField label={t("reports.filter.dateFrom")} className="sm:w-44">
          <Input
            type="date"
            value={list.filters.date_from ?? ""}
            onChange={(event) =>
              list.setFilter("date_from", event.target.value || undefined)
            }
          />
        </FilterField>
        <FilterField label={t("reports.filter.dateTo")} className="sm:w-44">
          <Input
            type="date"
            value={list.filters.date_to ?? ""}
            onChange={(event) =>
              list.setFilter("date_to", event.target.value || undefined)
            }
          />
        </FilterField>
        {mode === "quantity" && (
          <ReportChoiceField
            label={t("materialReports.view.label")}
            value={view === "normal" ? undefined : view}
            allLabel={t("materialReports.view.normal")}
            options={(["rejected", "returns"] as const).map((code) => ({
              value: code,
              label: t(`materialReports.view.${code}`),
            }))}
            onChange={(next) => list.setFilter("report_mode", next)}
          />
        )}
        <ReportKeywordField
          label={t("contractorReports.filter.keyword")}
          value={list.search}
          placeholder={t("reports.filter.keywordPlaceholder")}
          onChange={(search) => list.setSearch(search ?? "")}
        />
        <Button
          variant="outline"
          disabledReason={
            !list.hasFilters ? t("common.noFiltersSet") : undefined
          }
          disabled={!list.hasFilters}
          onClick={list.clearFilters}
        >
          <FilterX className="size-4" />
          {t("reports.filter.clear")}
        </Button>
      </FilterBar>

      {mode === "quantity" && summary.data?.cards && (
        <ModeCards
          cards={summary.data.cards}
          view={view}
          onPick={(next) => list.setFilter("report_mode", next)}
        />
      )}

      {summary.isLoading ? (
        <ReportSkeleton />
      ) : summary.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">
          {t("errors.generic")}
        </div>
      ) : mode === "quantity" ? (
        <QuantityReport data={summary.data} view={view} />
      ) : (
        <CostReport data={summary.data} />
      )}

      {(summary.data?.total_receipts ?? 0) > 0 && (
        <ReportRecords
          view={view}
          records={view === "returns" ? returnRows : deliveries}
          page={list.page}
          pageSize={list.pageSize}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      )}
    </div>
  );
}

/**
 * 「收货明细」 (Q11): the deliveries behind the figures, newest first, with
 * their photographs. A supplier can have hundreds of deliveries, so the list
 * pages through all of them (B10) instead of stopping at the first ten; the
 * page and page size live in the address like every other list. Each row
 * opens the delivery itself, where every photo is shown whole with its
 * watermark - in its record popup over the report, which stays where it was
 * (Lucas 2026-10-10: 「关掉还是会保留在刚刚的页面，不会跳转」).
 */
function ReportRecords({
  view,
  records,
  ...rest
}: {
  view: MaterialReportView;
  records: DeliveryRecordsQuery | ReturnRecordsQuery;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return view === "returns" ? (
    <ReturnRecords records={records as ReturnRecordsQuery} {...rest} />
  ) : (
    <DeliveryRecords view={view} records={records as DeliveryRecordsQuery} {...rest} />
  );
}

type ReportFilters = Record<string, string | undefined>;

/**
 * The last page stays up while the next loads - but not another project's
 * rows when the top bar moves (B13).
 */
export function sameProjectPlaceholder<T>(filters: ReportFilters) {
  return (previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
    (previousQuery?.queryKey[2] as { project?: string } | undefined)?.project === filters.project
      ? previous
      : undefined;
}

/** 「收货明细」's page (normal and 不合格 views). */
function useDeliveryRecords(filters: ReportFilters, page: number, pageSize: number, enabled: boolean) {
  return useQuery({
    queryKey: ["receipts", "report-records", filters, page, pageSize],
    // Newest first is the endpoint's own order (`-captured_at`).
    queryFn: () => getReceipts({ ...filters, page, page_size: pageSize }),
    placeholderData: sameProjectPlaceholder<Awaited<ReturnType<typeof getReceipts>>>(filters),
    enabled,
  });
}

/** 「退货明细」's page (J36 退货 view). */
function useReturnRecords(filters: ReportFilters, page: number, pageSize: number, enabled: boolean) {
  return useQuery({
    queryKey: ["receipts", "report-returns", filters, page, pageSize],
    queryFn: () => getMaterialReportReturns({ ...filters, page, page_size: pageSize }),
    placeholderData: sameProjectPlaceholder<Awaited<ReturnType<typeof getMaterialReportReturns>>>(filters),
    enabled,
  });
}

type DeliveryRecordsQuery = ReturnType<typeof useDeliveryRecords>;
type ReturnRecordsQuery = ReturnType<typeof useReturnRecords>;

function DeliveryRecords({
  view,
  records,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  view: MaterialReportView;
  records: DeliveryRecordsQuery;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const t = useTranslations();
  const unitName = useUnitName();
  const df = useDateFormat();
  const rows = records.data?.results ?? [];
  const total = records.data?.count ?? 0;
  const [opened, setOpened] = useState<string | null>(null);
  // 指定厂商（MR） only when a delivery in view names one (2026-10-10): a
  // column of dashes said nothing; the supplier is what matters day to day.
  const showManufacturer = anyNamedManufacturer(rows);
  return (
    <ReportTable
      title={t(
        view === "rejected"
          ? "materialReports.records.rejectedTitle"
          : "materialReports.records.title",
        { total },
      )}
    >
      <QueryFailedNote query={records} what={t("materialReports.records.what")} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("receipts.field.capturedAt")}</TableHead>
            <TableHead>{t("receipts.field.receiptNo")}</TableHead>
            <TableHead>{t("receipts.field.supplier")}</TableHead>
            {showManufacturer && <TableHead>{t("receipts.field.manufacturer")}</TableHead>}
            <TableHead>{t("receipts.field.materialName")}</TableHead>
            <TableHead>{t("receipts.field.spec")}</TableHead>
            <TableHead className="text-right">{t("receipts.field.quantity")}</TableHead>
            {view === "rejected" && <TableHead>{t("materialReports.records.reason")}</TableHead>}
            <TableHead>{t("materialReports.records.photos")}</TableHead>
            <TableHead className="text-right">{t("materialReports.records.open")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="tabular text-muted-foreground">{df.dateTime(row.captured_at)}</TableCell>
              <TableCell className="tabular font-medium">{row.receipt_no}</TableCell>
              <TableCell className={row.supplier ? undefined : "text-muted-foreground"}>
                {supplierShown(row.supplier_name, t("receipts.supplierUnfilled"))}
              </TableCell>
              {showManufacturer && (
                <TableCell>
                  <ManufacturerCell name={row.manufacturer_name} offList={row.manufacturer_off_list} />
                </TableCell>
              )}
              <TableCell>{row.material_name}</TableCell>
              <TableCell>{row.material_specification || row.spec_category_name || "—"}</TableCell>
              <TableCell className="tabular text-right">
                {row.quantity} {unitName(row.unit, row.unit_label)}
              </TableCell>
              {view === "rejected" && <TableCell>{row.rejection_reason || "—"}</TableCell>}
              <TableCell>
                <RecordPhotos record={row} />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => setOpened(row.id)}>
                  {t("materialReports.records.open")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <RecordsPager
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
      {opened ? (
        <ViewReceipt id={opened} presentation="dialog" onClose={() => setOpened(null)} />
      ) : null}
    </ReportTable>
  );
}

/** Previous / next and rows per page under 「收货明细」. */
function RecordsPager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const t = useTranslations();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-panel-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {total === 0
          ? t("table.showingEmpty")
          : t("table.showing", { from, to, total })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            size="sm"
            aria-label={t("table.perPage")}
            className="h-9 rounded-full border-border bg-card text-xs pointer-coarse:h-10"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-border bg-card px-3 text-xs pointer-coarse:h-10"
          disabledReason={page <= 1 ? t("common.alreadyFirstPage") : undefined}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
          {t("table.previous")}
        </Button>
        <span className="tabular px-1 text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-border bg-card px-3 text-xs pointer-coarse:h-10"
          disabledReason={
            page >= totalPages ? t("common.alreadyLastPage") : undefined
          }
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("table.next")}
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The delivery's photo strip (J34-2) from the row the list already sent -
 * `photo_thumbs`, small stamped thumbnails. It used to ask for every row's
 * whole delivery (one request each, up to 100 a page) and drew the
 * full-size photographs into 32 px boxes; now the photographs themselves
 * are read only when one is opened (报表中心 speed, 2026-10-22).
 */
function RecordPhotos({ record }: { record: MaterialReceipt }) {
  return (
    <PhotoStrip
      thumbs={record.photo_thumbs}
      coverUrl={record.cover_photo_url}
      count={record.photo_count}
      icon={ClipboardList}
      reference={record.receipt_no}
      photos={recordPhotos("MATERIAL_RECEIPT", record.id, record.receipt_no)}
    />
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((value) => (
          <Skeleton key={value} className="h-8 w-40 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function QuantityReport({
  data,
  view = "normal",
}: {
  data: Awaited<ReturnType<typeof getReceiptSummary>> | undefined;
  view?: MaterialReportView;
}) {
  const t = useTranslations();
  const unitName = useUnitName();
  const formatter = useFormatter();

  if (!data || data.total_receipts === 0) return <EmptyReport />;

  return (
    <div className="space-y-3">
      <MetricRow>
        <Metric
          icon={ReceiptText}
          label={t(
            view === "rejected"
              ? "materialReports.quantity.totalRejected"
              : view === "returns"
                ? "materialReports.quantity.totalReturns"
                : "materialReports.quantity.totalDeliveries",
          )}
          value={formatter.number(data.total_receipts)}
        />
        {data.by_unit.map((row) => (
          <Metric
            key={row.unit}
            icon={Package}
            label={unitName(row.unit)}
            value={row.quantity}
            detail={t("materialReports.quantity.deliveryCount", {
              count: row.receipts,
            })}
          />
        ))}
      </MetricRow>

      <ReportTable title={t("materialReports.quantity.byMaterial")}>
        {/* One quantity (Lucas 2026-10-10, 图1): 「两次收货，可是累计数量还是
            一样呢，保留一个就好了」. 累计数量 is the deliveries counted beside
            it, added up - the same loads 收货次数 counts. A material with no
            delivery in the period has nothing to show. */}
        <p className="px-3 py-1.5 text-xs text-muted-foreground">
          {t(`materialReports.quantity.${hintKey[view]}`)}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reports.receipts.material")}</TableHead>
              <TableHead>{t("receipts.field.materialSpecification")}</TableHead>
              <TableHead>{t("reports.receipts.unit")}</TableHead>
              <TableHead className="text-right">{t("receipts.field.cumulativeQuantity")}</TableHead>
              <TableHead className="text-right">{t("reports.receipts.deliveries")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.quantity_by_material.filter((row) => row.receipts > 0).map((row) => (
              <TableRow key={`${row.material_name}-${row.material_specification}-${row.unit}`}>
                <TableCell className="font-medium">{row.material_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.material_specification || t("common.emptyValue")}
                </TableCell>
                <TableCell><TypeBadge label={unitName(row.unit)} /></TableCell>
                <TableCell className="tabular text-right">{row.quantity}</TableCell>
                <TableCell className="tabular text-right text-muted-foreground">
                  {formatter.number(row.receipts)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportTable>

      <p className="text-xs text-muted-foreground">
        {t("materialReports.quantity.unitNote")}
      </p>
    </div>
  );
}

function CostReport({
  data,
}: {
  data: Awaited<ReturnType<typeof getReceiptSummary>> | undefined;
}) {
  const t = useTranslations();
  const unitName = useUnitName();
  const formatter = useFormatter();

  if (!data || data.total_receipts === 0) return <EmptyReport />;

  const money = (value: string | null) =>
    value === null
      ? t("common.emptyValue")
      : formatter.number(Number(value), { style: "currency", currency: "MYR" });
  const coverage =
    data.total_receipts === 0
      ? 0
      : Math.round((data.priced_receipts / data.total_receipts) * 100);

  return (
    <div className="space-y-3">
      <MetricRow>
        <Metric
          icon={Calculator}
          label={t("materialReports.cost.totalCost")}
          value={money(data.total_cost)}
        />
        <Metric
          icon={ReceiptText}
          label={t("materialReports.cost.pricedReceipts")}
          value={formatter.number(data.priced_receipts)}
          detail={t("materialReports.cost.coverage", { percent: coverage })}
        />
        <Metric
          icon={AlertTriangle}
          label={t("materialReports.cost.unpricedReceipts")}
          value={formatter.number(data.unpriced_receipts)}
          warning={data.unpriced_receipts > 0}
        />
      </MetricRow>

      {data.unpriced_receipts > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>{t("materialReports.cost.incompleteWarning", { count: data.unpriced_receipts })}</p>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <ReportTable title={t("materialReports.cost.bySupplier")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("receipts.field.supplier")}</TableHead>
                <TableHead className="text-right">{t("reports.receipts.deliveries")}</TableHead>
                <TableHead className="text-right">{t("materialReports.cost.totalCost")}</TableHead>
                <TableHead className="text-right">{t("materialReports.cost.missingPrices")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_supplier.map((row) => (
                <TableRow key={row.supplier ?? UNFILLED_SUPPLIER}>
                  {/* The deliveries 「未填供应商」 (I23): their own line, nobody's. */}
                  <TableCell className={cn("font-medium", !row.supplier && "text-muted-foreground")}>
                    {supplierShown(row.supplier_name, t("receipts.supplierUnfilled"))}
                  </TableCell>
                  <TableCell className="tabular text-right">{row.receipts}</TableCell>
                  <TableCell className="tabular text-right">{money(row.total_cost)}</TableCell>
                  <TableCell className="tabular text-right">
                    {row.unpriced_receipts > 0 ? (
                      <span className="text-warning">{row.unpriced_receipts}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTable>

        <ReportTable title={t("materialReports.cost.byMaterial")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.receipts.material")}</TableHead>
                <TableHead>{t("receipts.field.spec")}</TableHead>
                <TableHead>{t("reports.receipts.unit")}</TableHead>
                <TableHead className="text-right">{t("materialReports.cost.totalCost")}</TableHead>
                <TableHead className="text-right">{t("materialReports.cost.missingPrices")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_material.map((row) => (
                <TableRow key={`${row.material_name}-${row.material_specification ?? ""}-${row.unit}`}>
                  <TableCell className="font-medium">{row.material_name}</TableCell>
                  <TableCell>{row.material_specification || "—"}</TableCell>
                  <TableCell><TypeBadge label={unitName(row.unit)} /></TableCell>
                  <TableCell className="tabular text-right">{money(row.total_cost)}</TableCell>
                  <TableCell className="tabular text-right">
                    {row.unpriced_receipts > 0 ? (
                      <span className="text-warning">{row.unpriced_receipts}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTable>
      </div>
    </div>
  );
}

/** The report's headline figures: one wrapping row of small labels (B10, B11). */
function MetricRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/**
 * One headline figure as a small label - icon, name, number and an optional
 * note on one line - so the figures take a single row and the deliveries
 * below them get the screen (B10). Each used to be a 100px-tall card.
 */
function Metric({
  icon: Icon,
  label,
  value,
  detail,
  warning = false,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  detail?: string;
  warning?: boolean;
}) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
      <Icon
        className={cn("size-3.5 shrink-0", warning ? "text-warning" : "text-primary")}
      />
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular font-semibold", warning && "text-warning")}>
        {value}
      </span>
      {detail && (
        <span className="truncate text-xs text-muted-foreground">· {detail}</span>
      )}
    </div>
  );
}

/**
 * A titled table with tight rows. `Table` carries its own sideways scroller,
 * so there is no second one here: the page itself only ever scrolls up and
 * down, phone included.
 */
function ReportTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-panel overflow-hidden rounded-xl">
      <h3 className="panel-title border-b border-panel-border px-4 py-3">{title}</h3>
      <div className="[&_td]:px-3 [&_td]:py-1 [&_th]:h-8 [&_th]:px-3">{children}</div>
    </section>
  );
}

function EmptyReport() {
  const t = useTranslations();
  return (
    <div className="rounded-xl border border-dashed border-panel-border px-6 py-16 text-center text-sm text-muted-foreground">
      {t("reports.empty")}
    </div>
  );
}


/**
 * 「不合格」 and 「退货」 cards (J36): how many times and how much, always
 * visible, so a rejected load is never unseen. Pressing one switches the
 * report to that view; pressing the open one goes back to the normal one.
 */
function ModeCards({
  cards,
  view,
  onPick,
}: {
  cards: NonNullable<Awaited<ReturnType<typeof getReceiptSummary>>["cards"]>;
  view: MaterialReportView;
  onPick: (next: "rejected" | "returns" | undefined) => void;
}) {
  const t = useTranslations();
  const unitName = useUnitName();
  const quantity = (card: (typeof cards)["rejected"]) =>
    card.by_unit.length === 0
      ? "0"
      : card.by_unit.map((row) => `${row.quantity} ${unitName(row.unit)}`).join(", ");
  return (
    <div className="flex flex-wrap gap-2">
      {(["rejected", "returns"] as const).map((code) => {
        const card = cards[code];
        const open = view === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={open}
            onClick={() => onPick(open ? undefined : code)}
            className={cn(
              "flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              open && "border-primary ring-1 ring-primary",
            )}
          >
            <AlertTriangle
              className={cn(
                "size-3.5 shrink-0",
                code === "rejected" && card.count > 0 ? "text-warning" : "text-primary",
              )}
            />
            <span className="truncate text-xs text-muted-foreground">
              {t(`materialReports.cards.${code}`)}
            </span>
            <span className="tabular font-semibold">
              {t("materialReports.cards.times", { count: card.count })} / {quantity(card)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 「退货明细」 (J36): the returns that left site, newest first. */
function ReturnRecords({
  records,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  records: ReturnRecordsQuery;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const t = useTranslations();
  const unitName = useUnitName();
  const df = useDateFormat();
  const rows = records.data?.results ?? [];
  const total = records.data?.count ?? 0;
  return (
    <ReportTable title={t("materialReports.records.returnsTitle", { total })}>
      <QueryFailedNote query={records} what={t("materialReports.records.returnsWhat")} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("materialReports.records.returnedAt")}</TableHead>
            <TableHead>{t("materialReports.records.returnNo")}</TableHead>
            <TableHead>{t("receipts.field.supplier")}</TableHead>
            <TableHead>{t("receipts.field.materialName")}</TableHead>
            <TableHead>{t("receipts.field.spec")}</TableHead>
            <TableHead className="text-right">
              {t("materialReports.records.returnedQuantity")}
            </TableHead>
            <TableHead>{t("materialReports.records.reason")}</TableHead>
            <TableHead>{t("materialReports.records.photos")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="tabular text-muted-foreground">
                {df.dateTime(row.processed_at ?? row.captured_at)}
              </TableCell>
              <TableCell className="tabular font-medium">
                {row.return_note_no || row.reference_no}
              </TableCell>
              <TableCell className={row.supplier ? undefined : "text-muted-foreground"}>
                {supplierShown(row.supplier_name ?? "", t("receipts.supplierUnfilled"))}
              </TableCell>
              <TableCell>{row.material_name}</TableCell>
              <TableCell>{row.material_specification || row.spec_category_name || "—"}</TableCell>
              <TableCell className="tabular text-right">
                {row.returned_quantity} {unitName(row.unit, row.unit_label)}
              </TableCell>
              <TableCell>{row.reason || "—"}</TableCell>
              <TableCell>
                {row.cover_photo_url ? (
                  <span className="relative block size-8 overflow-hidden rounded-md border bg-muted">
                    <Image
                      src={row.cover_photo_url}
                      alt={row.reference_no}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("materialReports.records.noPhotos")}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <RecordsPager
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </ReportTable>
  );
}
