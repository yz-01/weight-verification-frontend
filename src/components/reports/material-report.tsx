"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calculator,
  FilterX,
  Package,
  ReceiptText,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { ListHeader, TypeBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListQuery } from "@/hooks/use-list-query";
import { MATERIAL_UNITS } from "@/interfaces/contractor";
import {
  exportReceipts,
  getReceiptSummary,
  type ExportFormat,
} from "@/services/contractor.service";

export type MaterialReportMode = "quantity" | "cost";

export function MaterialReport({ mode }: { mode: MaterialReportMode }) {
  const t = useTranslations();
  const { can } = useAuth();
  const list = useListQuery(["project", "date_from", "date_to"]);
  const filters = {
    project: list.filters.project,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
  };

  const summary = useQuery({
    queryKey: ["receipts", "summary", mode, filters],
    queryFn: () => getReceiptSummary(filters),
  });

  function runExport(format: ExportFormat) {
    return exportReceipts({
      format,
      title: t(`materialReports.${mode}.title`),
      subtitle: t("materialReports.export.subtitle"),
      emptyLabel: t("table.noResults"),
      query: filters,
      columns:
        mode === "quantity"
          ? [
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
            ]
          : [
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
            ],
    });
  }

  return (
    <div className="space-y-4">
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

      <div className="grid gap-3 border-y bg-card/50 py-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto] md:items-end">
        {can("project.view") && (
          <div className="space-y-1.5">
            <Label>{t("reports.filter.project")}</Label>
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
          </div>
        )}
        <div className="space-y-1.5">
          <Label>{t("reports.filter.dateFrom")}</Label>
          <Input
            type="date"
            value={list.filters.date_from ?? ""}
            onChange={(event) =>
              list.setFilter("date_from", event.target.value || undefined)
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("reports.filter.dateTo")}</Label>
          <Input
            type="date"
            value={list.filters.date_to ?? ""}
            onChange={(event) =>
              list.setFilter("date_to", event.target.value || undefined)
            }
          />
        </div>
        <Button
          variant="outline"
          disabled={!list.hasFilters}
          onClick={list.clearFilters}
        >
          <FilterX className="h-4 w-4" />
          {t("reports.filter.clear")}
        </Button>
      </div>

      {summary.isLoading ? (
        <ReportSkeleton />
      ) : summary.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">
          {t("errors.generic")}
        </div>
      ) : mode === "quantity" ? (
        <QuantityReport data={summary.data} />
      ) : (
        <CostReport data={summary.data} />
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((value) => (
          <Skeleton key={value} className="h-24 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-md" />
    </div>
  );
}

function QuantityReport({
  data,
}: {
  data: Awaited<ReturnType<typeof getReceiptSummary>> | undefined;
}) {
  const t = useTranslations();
  const formatter = useFormatter();

  if (!data || data.total_receipts === 0) return <EmptyReport />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={ReceiptText}
          label={t("materialReports.quantity.totalDeliveries")}
          value={formatter.number(data.total_receipts)}
        />
        {data.by_unit.map((row) => (
          <Metric
            key={row.unit}
            icon={Package}
            label={t(`receipts.unit.${row.unit}`)}
            value={row.quantity}
            detail={t("materialReports.quantity.deliveryCount", {
              count: row.receipts,
            })}
          />
        ))}
      </div>

      <ReportTable title={t("materialReports.quantity.byMaterial")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reports.receipts.material")}</TableHead>
              <TableHead>{t("reports.receipts.unit")}</TableHead>
              <TableHead className="text-right">{t("reports.receipts.quantity")}</TableHead>
              <TableHead className="text-right">{t("reports.receipts.deliveries")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.by_material.map((row) => (
              <TableRow key={`${row.material_name}-${row.unit}`}>
                <TableCell className="font-medium">{row.material_name}</TableCell>
                <TableCell><TypeBadge label={t(`receipts.unit.${row.unit}`)} /></TableCell>
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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
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
      </div>

      {data.unpriced_receipts > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{t("materialReports.cost.incompleteWarning", { count: data.unpriced_receipts })}</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
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
                  <TableCell><TypeBadge label={t(`receipts.unit.${row.unit}`)} /></TableCell>
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
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={warning ? "h-4 w-4 text-warning" : "h-4 w-4 text-primary"} />
        <p className="truncate text-xs font-medium uppercase">{label}</p>
      </div>
      <p className={warning ? "tabular mt-2 text-2xl font-semibold text-warning" : "tabular mt-2 text-2xl font-semibold"}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ReportTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border bg-card">
      <h3 className="border-b px-4 py-3 text-sm font-semibold">{title}</h3>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function EmptyReport() {
  const t = useTranslations();
  return (
    <div className="rounded-md border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
      {t("reports.empty")}
    </div>
  );
}
