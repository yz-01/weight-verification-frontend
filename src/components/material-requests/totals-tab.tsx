"use client";

/**
 * 申请累计 (C04), the existing page improved - JB243 (客户 11-23 事项 15, 图 16).
 *
 * 「请完善现有页面，不需要另外建立一个报表」: the same tab, grouped as before by
 * project + 「材料 + 规格 + 单位」, with the columns the client listed -
 * MR 已批准 / MR 未批准 / MR 已退回 (existing), MI 现场实际签收, RN 实际退货 and
 * 尚未收货 = MR 已批准 − MI 签收. Each figure is its own sum (「所有数量独立累计，
 * 不互相扣减」); only 尚未收货 is a formula. Search by 项目, 材料, 规格 and 供应商,
 * any of them together. An MR is never split by supplier: with a supplier
 * chosen, MI and RN are that supplier's and the MR figures stay the project's
 * (「MR仍显示项目层级的申请统计，供应商筛选则对应MI签收及RN退货记录」) - said in one
 * line on the page. A figure opens the records behind it, each of which opens
 * its own record (「点击累计数量可以查看原始记录及历史证据」). 【导出】 writes the
 * same columns with the same filters.
 *
 * MI and RN come from 材料管理: only someone who may read deliveries
 * (`receipt.view`) sees those columns - the server leaves them out otherwise.
 */

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useUnitLabel } from "@/components/material-requests/request-form";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { ProjectListFilter } from "@/components/shared/module-records-table";
import { EmptyState, FilterBar, LoadFailed } from "@/components/shared/page-primitives";
import { SupplierDateListFilter } from "@/components/shared/supplier-date-filter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  MaterialRequestTotal,
  MaterialRequestTotalColumn,
  MaterialRequestTotalRecord,
} from "@/interfaces/material-request";
import { useDateFormat } from "@/lib/dates";
import {
  exportMaterialRequestTotals,
  getMaterialRequestTotalRecords,
  getMaterialRequestTotals,
} from "@/services/material-request.service";

/** The export's columns, in the screen's order (JB243). */
export function totalsExportColumns(
  t: (key: string) => string,
  unitValues: Record<string, string>,
  deliveries: boolean,
) {
  return [
    { key: "project_label", label: t("field.project") },
    { key: "material_name", label: t("field.material") },
    { key: "specification", label: t("field.specification") },
    { key: "unit", label: t("field.unit"), values: unitValues },
    { key: "approved_quantity", label: t("jb243.approved") },
    { key: "approved_count", label: t("totals.approvedCount") },
    { key: "pending_quantity", label: t("jb243.pending") },
    { key: "pending_count", label: t("totals.pendingCount") },
    { key: "returned_count", label: t("jb243.returned") },
    ...(deliveries
      ? [
          { key: "mi_quantity", label: t("jb243.mi") },
          { key: "mi_count", label: t("jb243.miCount") },
          { key: "rn_quantity", label: t("jb243.rn") },
          { key: "rn_count", label: t("jb243.rnCount") },
          { key: "outstanding_quantity", label: t("jb243.outstanding") },
          { key: "over_received_quantity", label: t("jb243.overColumn") },
        ]
      : []),
  ];
}

/** Whether a figure shows more than zero (strings such as "0.000"). */
function positive(value: string | null | undefined) {
  return Number(value ?? 0) > 0;
}

export function TotalsTab({ onOpenGroup }: { onOpenGroup: (filters: Record<string, string>) => void }) {
  const tGroup = useTranslations("materialRequest");
  const tRoot = useTranslations();
  const t = (key: string, values?: Record<string, string | number>) => tGroup(key, values);
  const { can } = useAuth();
  // MI / RN are 材料管理's (the server sends them only to who reads deliveries).
  const deliveries = can("receipt.view");
  const unitLabel = useUnitLabel();
  const list = useListQuery(["project", "material", "specification", "supplier"]);
  const supplier = list.filters.supplier ?? "";
  const totals = useQuery({
    queryKey: ["material-requests", "totals", list.filters],
    queryFn: () => getMaterialRequestTotals(list.filters),
  });
  const rows = totals.data ?? [];
  const [opened, setOpened] = useState<{ row: MaterialRequestTotal; column: MaterialRequestTotalColumn } | null>(null);
  const showDeliveries = deliveries && rows.every((row) => row.mi_quantity !== null);

  const figure = (
    row: MaterialRequestTotal,
    column: MaterialRequestTotalColumn,
    value: string,
    count: number | null,
    tone: string,
  ) => (
    <button
      type="button"
      className={`tabular rounded px-1 text-right font-semibold underline-offset-2 hover:underline ${tone}`}
      data-slot={`mr-total-${column}`}
      onClick={(event) => {
        event.stopPropagation();
        setOpened({ row, column });
      }}
    >
      {value}
      {count !== null && (
        <span className="block text-2xs font-normal text-muted-foreground">{t("jb243.records", { count })}</span>
      )}
    </button>
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("totals.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("jb243.basis")}</p>
      </div>
      <FilterBar>
        <ProjectListFilter list={list} />
        <TextFilter list={list} param="material" placeholder={t("filter.material")} />
        <TextFilter list={list} param="specification" placeholder={t("filter.specification")} />
        {/* 「按供应商搜索」: MI and RN follow it; the MR figures do not. */}
        {deliveries && <SupplierDateListFilter list={list} showDates={false} />}
        {/* The totals on screen, as a file (H16, HD13): same columns, same filters. */}
        <ExportButton
          disabled={rows.length === 0}
          disabledReason={t("jb243.basis")}
          title={t("totals.title")}
          onExport={(format) =>
            exportMaterialRequestTotals({
              format,
              title: t("totals.title"),
              subtitle: supplier ? `${t("jb243.basis")} ${t("jb243.supplierNote")}` : t("jb243.basis"),
              query: list.filters,
              columns: totalsExportColumns(
                (key) => tGroup(key),
                tRoot.raw("mySubmissions.unit") as Record<string, string>,
                showDeliveries,
              ),
            })
          }
        />
      </FilterBar>
      {supplier && deliveries && (
        <p className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-xs" data-slot="mr-totals-supplier-note">
          {t("jb243.supplierNote")}
        </p>
      )}
      {totals.isError ? (
        <LoadFailed what={t("totals.title")} onRetry={() => void totals.refetch()} />
      ) : totals.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={t("totals.empty")} />
      ) : (
        <div className="surface-panel overflow-x-auto rounded-xl">
          <Table className="min-w-180">
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.project")}</TableHead>
                <TableHead>{t("field.material")}</TableHead>
                <TableHead>{t("field.specification")}</TableHead>
                <TableHead>{t("field.unit")}</TableHead>
                <TableHead className="tabular text-right">{t("jb243.approved")}</TableHead>
                <TableHead className="tabular text-right">{t("jb243.pending")}</TableHead>
                <TableHead className="tabular text-right">{t("jb243.returned")}</TableHead>
                {showDeliveries && (
                  <>
                    <TableHead className="tabular text-right">{t("jb243.mi")}</TableHead>
                    <TableHead className="tabular text-right">{t("jb243.rn")}</TableHead>
                    <TableHead className="tabular text-right">
                      {t("jb243.outstanding")}
                      <span className="block text-2xs font-normal text-muted-foreground">{t("jb243.outstandingFormula")}</span>
                    </TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.project}|${row.material_name}|${row.specification}|${row.unit}`}
                  className="cursor-pointer"
                  onClick={() =>
                    onOpenGroup({
                      project: row.project,
                      material: row.material_name,
                      specification: row.specification,
                      unit: row.unit,
                    })
                  }
                >
                  <TableCell>{row.project_code} - {row.project_name}</TableCell>
                  <TableCell className="font-medium">{row.material_name}</TableCell>
                  <TableCell>{row.specification}</TableCell>
                  <TableCell>{unitLabel(row.unit)}</TableCell>
                  <TableCell className="text-right">
                    {figure(row, "approved", row.approved_quantity, row.approved_count, "text-success")}
                  </TableCell>
                  <TableCell className="text-right">
                    {figure(row, "pending", row.pending_quantity, row.pending_count, "text-warning")}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <button
                      type="button"
                      className="rounded px-1 text-right underline-offset-2 hover:underline"
                      data-slot="mr-total-returned"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpened({ row, column: "returned" });
                      }}
                    >
                      {t("totals.requests", { count: row.returned_count })}
                    </button>
                  </TableCell>
                  {showDeliveries && (
                    <>
                      <TableCell className="text-right">
                        {figure(row, "mi", row.mi_quantity ?? "0.000", row.mi_count, "text-info")}
                      </TableCell>
                      <TableCell className="text-right">
                        {figure(row, "rn", row.rn_quantity ?? "0.000", row.rn_count, "text-destructive")}
                      </TableCell>
                      <TableCell className="tabular text-right" data-slot="mr-total-outstanding">
                        <span className={`font-semibold ${positive(row.outstanding_quantity) ? "text-warning" : ""}`}>
                          {row.outstanding_quantity}
                        </span>
                        {positive(row.over_received_quantity) && (
                          <span className="block text-2xs text-muted-foreground">
                            {t("jb243.over", { quantity: row.over_received_quantity ?? "" })}
                          </span>
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t(showDeliveries ? "jb243.footer" : "totals.notStock")}</p>
      {opened && (
        <TotalRecordsDialog
          row={opened.row}
          column={opened.column}
          supplier={supplier}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}

const COLUMN_TITLE: Record<MaterialRequestTotalColumn, string> = {
  approved: "jb243.approved",
  pending: "jb243.pending",
  returned: "jb243.returned",
  mi: "jb243.mi",
  rn: "jb243.rn",
};

/** The records behind one figure; each opens its own record. */
export function TotalRecordsDialog({
  row,
  column,
  supplier,
  onClose,
}: {
  row: MaterialRequestTotal;
  column: MaterialRequestTotalColumn;
  supplier: string;
  onClose: () => void;
}) {
  const t = useTranslations("materialRequest");
  const router = useRouter();
  const df = useDateFormat();
  const unitLabel = useUnitLabel();
  // Only MI and RN follow the supplier filter; the requests never do.
  const bySupplier = column === "mi" || column === "rn" ? supplier : "";
  const records = useQuery({
    queryKey: ["material-requests", "total-records", row.project, row.material_name, row.specification, row.unit, column, bySupplier],
    queryFn: () => getMaterialRequestTotalRecords(row, column, bySupplier || undefined),
  });
  const items: MaterialRequestTotalRecord[] = records.data ?? [];
  const statusWord = (item: MaterialRequestTotalRecord) => {
    if (item.kind === "MR") return t(`status.${item.status}`);
    return "";
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" data-slot="mr-total-records">
        <DialogHeader>
          <DialogTitle>{t(COLUMN_TITLE[column])}</DialogTitle>
          <DialogDescription>
            {[row.project_code, row.material_name, row.specification, unitLabel(row.unit)].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {records.isError ? (
          <LoadFailed what={t(COLUMN_TITLE[column])} onRetry={() => void records.refetch()} />
        ) : records.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t("jb243.noRecords")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("jb243.recordNo")}</TableHead>
                <TableHead>{t("jb243.recordDate")}</TableHead>
                <TableHead className="tabular text-right">{t("field.quantity")}</TableHead>
                <TableHead>{t("field.supplier")}</TableHead>
                <TableHead>{t("jb243.recordStatus")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={`${item.kind}-${item.id}-${item.quantity}`}
                  className="cursor-pointer"
                  onClick={() => router.push(item.href)}
                >
                  <TableCell className="font-medium">
                    {item.reference}
                    <span className="block text-2xs text-muted-foreground">{t(`jb243.kind.${item.kind}`)}</span>
                  </TableCell>
                  <TableCell>{item.date ? df.dateTime(item.date) : "—"}</TableCell>
                  <TableCell className="tabular text-right">
                    {item.quantity} {unitLabel(item.unit)}
                  </TableCell>
                  <TableCell>{item.supplier_name || "—"}</TableCell>
                  <TableCell>{statusWord(item) || (item.delivery_note_no ? `DO ${item.delivery_note_no}` : "—")}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("jb243.open")}
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(item.href);
                      }}
                    >
                      <ExternalLink className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">{t("jb243.recordsHelp")}</p>
      </DialogContent>
    </Dialog>
  );
}

/** A filter box that writes to the URL when the person stops typing. */
function TextFilter({
  list,
  param,
  placeholder,
}: {
  list: ReturnType<typeof useListQuery>;
  param: string;
  placeholder: string;
}) {
  const [value, setValue] = useState(list.filters[param] ?? "");
  const current = list.filters[param] ?? "";
  const { setFilter } = list;
  useEffect(() => {
    if (value === current) return;
    const timer = setTimeout(() => setFilter(param, value.trim() || undefined), 400);
    return () => clearTimeout(timer);
  }, [value, current, param, setFilter]);
  return (
    <Input
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="w-full sm:w-40"
    />
  );
}
