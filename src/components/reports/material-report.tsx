"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calculator,
  ChevronLeft,
  ChevronRight,
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
import { SupplierDateFilter } from "@/components/shared/supplier-date-filter";
import { useUnitExportValues, useUnitName } from "@/hooks/use-material-units";
import { useDateFormat } from "@/lib/dates";
import { materialExportSubtitle } from "@/lib/report-menu";
import { cn } from "@/lib/utils";
import {
  exportReceipts,
  getReceipt,
  getReceipts,
  getReceiptSummary,
  type ExportFormat,
} from "@/services/contractor.service";

export type MaterialReportMode = "quantity" | "cost";

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
    "project", "date_from", "date_to", "category", "supplier", "manufacturer", "acceptance",
  ]);
  const topBar = useCurrentProject();
  const projectBoxShown = can("project.view") && !topBar.active;
  const filters = {
    project: list.filters.project,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
    category: list.filters.category,
    supplier: list.filters.supplier,
    // Whose make (2026-10 D1): the figures, the records and the export.
    manufacturer: list.filters.manufacturer,
    acceptance: list.filters.acceptance,
    search: list.search || undefined,
  };
  const unitValues = useUnitExportValues();

  const summary = useQuery({
    queryKey: ["receipts", "summary", mode, filters],
    queryFn: () => getReceiptSummary(filters),
  });
  const columns = useMaterialColumns(filters.project);
  // A failed column list leaves the figures right and only the name unknown.
  const materialName = filters.category
    ? columns.isError
      ? t("common.emptyValue")
      : columns.data?.results.find((row) => row.id === filters.category)?.name
    : t("reportSelector.allMaterials");
  const supplierName = filters.supplier
    ? summary.data?.by_supplier.find((row) => row.supplier === filters.supplier)?.supplier_name
    : t("reportSelector.allSuppliers");
  const level = [materialName ?? "…", supplierName ?? "…"].join(" › ");
  const chosen = [t(`materialReports.${mode}.title`), level].join(" › ");

  function runExport(format: ExportFormat) {
    return exportReceipts({
      format,
      title: t(`materialReports.${mode}.title`),
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
      summary:
        mode === "quantity"
          ? {
              groupBy: "material_cumulative",
              title: t("materialReports.export.cumulativeTitle"),
              materialLabel: t("reports.receipts.material"),
              specificationLabel: t("receipts.field.materialSpecification"),
              unitLabel: t("reports.receipts.unit"),
              quantityLabel: t("receipts.field.cumulativeQuantity"),
              countLabel: t("reports.receipts.deliveries"),
              note: t("materialReports.quantity.cumulativeHint"),
            }
          : undefined,
      columns:
        mode === "quantity"
          ? [
              { key: "receipt_no", label: t("receipts.field.receiptNo") },
              { key: "captured_at", label: t("receipts.field.capturedAt") },
              { key: "project_code", label: t("receipts.field.project") },
              { key: "supplier_name", label: t("receipts.field.supplier") },
              // DO and plate head every delivery (2026-10 C12).
              { key: "delivery_note_no", label: t("receipts.field.deliveryNoteNo") },
              { key: "vehicle_plate", label: t("receipts.field.vehiclePlate") },
              { key: "manufacturer_name", label: t("receipts.field.manufacturer") },
              { key: "material_name", label: t("receipts.field.materialName") },
              // One quantity per delivery; the sum is the closing section's
              // 累计数量 (Lucas 2026-10-10: 「保留一个就好了」).
              { key: "quantity", label: t("receipts.field.quantity") },
              {
                key: "unit",
                label: t("receipts.field.unit"),
                values: unitValues,
              },
            ]
          : [
              { key: "receipt_no", label: t("receipts.field.receiptNo") },
              { key: "captured_at", label: t("receipts.field.capturedAt") },
              { key: "project_code", label: t("receipts.field.project") },
              { key: "supplier_name", label: t("receipts.field.supplier") },
              // DO and plate head every delivery (2026-10 C12).
              { key: "delivery_note_no", label: t("receipts.field.deliveryNoteNo") },
              { key: "vehicle_plate", label: t("receipts.field.vehiclePlate") },
              { key: "manufacturer_name", label: t("receipts.field.manufacturer") },
              { key: "material_name", label: t("receipts.field.materialName") },
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
          />
        </FilterField>
        <ReportChoiceField
          label={t("reportSelector.material")}
          value={list.filters.category}
          options={(columns.data?.results ?? []).map((row) => ({
            value: row.id,
            label: row.name,
          }))}
          onChange={(category) => list.setFilter("category", category)}
          loading={columns.isLoading}
        />
        <FilterField label={t("receipts.field.manufacturer")} className="sm:w-52">
          <SupplierDateFilter
            value={{ manufacturer: list.filters.manufacturer }}
            onChange={(next) => list.setFilter("manufacturer", next.manufacturer)}
            showSupplier={false}
            showDates={false}
            showManufacturer
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
        <ReportChoiceField
          label={t("receipts.acceptance.title")}
          value={list.filters.acceptance}
          options={(["PENDING", "ACCEPTED", "REJECTED"] as const).map((code) => ({
            value: code,
            label: t(`receipts.acceptance.status.${code}`),
          }))}
          onChange={(acceptance) => list.setFilter("acceptance", acceptance)}
        />
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

      {summary.isLoading ? (
        <ReportSkeleton />
      ) : summary.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">
          {t("errors.generic")}
        </div>
      ) : mode === "quantity" ? (
        <QuantityReport data={summary.data} />
      ) : (
        <CostReport data={summary.data} />
      )}

      {(summary.data?.total_receipts ?? 0) > 0 && (
        <ReportRecords
          filters={filters}
          page={list.page}
          pageSize={list.pageSize}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      )}
    </div>
  );
}

const THUMBNAILS = 3;

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
  filters,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  filters: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const t = useTranslations();
  const unitName = useUnitName();
  const df = useDateFormat();
  const records = useQuery({
    queryKey: ["receipts", "report-records", filters, page, pageSize],
    queryFn: () =>
      // Newest first is the endpoint's own order (`-captured_at`).
      getReceipts({ ...filters, page, page_size: pageSize }),
    // The last page stays up while the next loads - but not another
    // project's rows when the top bar moves (B13).
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2] as { project?: string } | undefined)?.project ===
      (filters as { project?: string }).project
        ? previous
        : undefined,
  });
  const rows = records.data?.results ?? [];
  const total = records.data?.count ?? 0;
  const [opened, setOpened] = useState<string | null>(null);
  // 指定厂商（MR） only when a delivery in view names one (2026-10-10): a
  // column of dashes said nothing; the supplier is what matters day to day.
  const showManufacturer = anyNamedManufacturer(rows);
  return (
    <ReportTable title={t("materialReports.records.title", { total })}>
      <QueryFailedNote query={records} what={t("materialReports.records.what")} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("receipts.field.capturedAt")}</TableHead>
            <TableHead>{t("receipts.field.receiptNo")}</TableHead>
            <TableHead>{t("receipts.field.supplier")}</TableHead>
            {showManufacturer && <TableHead>{t("receipts.field.manufacturer")}</TableHead>}
            <TableHead>{t("receipts.field.materialName")}</TableHead>
            <TableHead className="text-right">{t("receipts.field.quantity")}</TableHead>
            <TableHead>{t("materialReports.records.photos")}</TableHead>
            <TableHead className="text-right">{t("materialReports.records.open")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="tabular text-muted-foreground">{df.dateTime(row.captured_at)}</TableCell>
              <TableCell className="tabular font-medium">{row.receipt_no}</TableCell>
              <TableCell>{row.supplier_name}</TableCell>
              {showManufacturer && (
                <TableCell>
                  <ManufacturerCell name={row.manufacturer_name} offList={row.manufacturer_off_list} />
                </TableCell>
              )}
              <TableCell>{row.material_name}</TableCell>
              <TableCell className="tabular text-right">
                {row.quantity} {unitName(row.unit, row.unit_label)}
              </TableCell>
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

/** Up to three thumbnails, read from the delivery only when it has any. */
function RecordPhotos({ record }: { record: MaterialReceipt }) {
  const t = useTranslations();
  const count = record.photo_count ?? 0;
  const detail = useQuery({
    queryKey: ["receipts", "detail", record.id],
    queryFn: () => getReceipt(record.id),
    enabled: count > 0,
    staleTime: 60_000,
  });
  if (count === 0) {
    return <span className="text-xs text-muted-foreground">{t("materialReports.records.noPhotos")}</span>;
  }
  if (detail.isError) {
    return <span className="text-xs text-muted-foreground">{t("materialReports.records.photosFailed", { count })}</span>;
  }
  const photos = (detail.data?.photos ?? []).slice(0, THUMBNAILS);
  return (
    <span className="flex items-center gap-1">
      {photos.map((photo) => (
        <a
          key={photo.id}
          href={photo.watermarked || photo.image}
          target="_blank"
          rel="noreferrer"
          className="relative block size-8 overflow-hidden rounded-md border bg-muted"
        >
          <Image
            src={photo.watermarked || photo.image}
            alt={photo.caption || record.receipt_no}
            fill
            unoptimized
            className="object-cover"
          />
        </a>
      ))}
      {count > photos.length && (
        <span className="text-xs text-muted-foreground">+{count - photos.length}</span>
      )}
    </span>
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
}: {
  data: Awaited<ReturnType<typeof getReceiptSummary>> | undefined;
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
          label={t("materialReports.quantity.totalDeliveries")}
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
          {t("materialReports.quantity.cumulativeHint")}
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
                <TableRow key={row.supplier}>
                  <TableCell className="font-medium">{row.supplier_name}</TableCell>
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
                <TableHead>{t("reports.receipts.unit")}</TableHead>
                <TableHead className="text-right">{t("materialReports.cost.totalCost")}</TableHead>
                <TableHead className="text-right">{t("materialReports.cost.missingPrices")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_material.map((row) => (
                <TableRow key={`${row.material_name}-${row.unit}`}>
                  <TableCell className="font-medium">{row.material_name}</TableCell>
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
