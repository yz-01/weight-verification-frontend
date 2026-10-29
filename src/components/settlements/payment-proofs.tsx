"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, FileText, ReceiptText } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { RecordExportButton } from "@/components/shared/record-export-button";
import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FilterBar,
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportButton } from "@/components/shared/export-button";
import { useListQuery } from "@/hooks/use-list-query";
import type { Settlement } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { isRouteAllowed } from "@/lib/navigation";
import { exportTransactions, getSettlements } from "@/services/recycler.service";
import { FileThumbs, pictureByName } from "@/components/shared/file-thumbs";
import { RecordSendLog } from "@/components/shared/record-send-log";

export function PaymentProofs() {
  const t = useTranslations();
  const df = useDateFormat();
  const formatter = useFormatter();
  const { can } = useAuth();
  const canOpenSettlement = useCanOpenSettlement();
  const list = useListQuery(["project", "state", "date_from", "date_to"]);
  const [viewing, setViewing] = useState<Settlement | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settlements", "payment-proofs", list.query],
    queryFn: () => getSettlements(list.query),
  });

  const columns = useMemo<ColumnDef<Settlement, unknown>[]>(
    () => [
      {
        accessorKey: "settlement_no",
        meta: { label: t("paymentProofs.field.settlementNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("paymentProofs.field.settlementNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular font-medium text-foreground">
              {row.original.settlement_no}
            </p>
            <p className="tabular text-xs text-muted-foreground">
              {row.original.dispatch_no}
            </p>
          </div>
        ),
      },
      {
        id: "project",
        meta: { label: t("paymentProofs.field.project") },
        header: () => t("paymentProofs.field.project"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-55 truncate">{row.original.project_name}</p>
            <p className="max-w-55 truncate text-xs text-muted-foreground">
              {row.original.recycler_name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "issued_at",
        meta: { label: t("paymentProofs.field.issuedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("paymentProofs.field.issuedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.issued_at
              ? df.date(row.original.issued_at)
              : t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "total_amount",
        meta: { label: t("paymentProofs.field.totalAmount") },
        header: ({ column }) => (
          <div className="flex justify-end">
            <SortableHeader
              label={t("paymentProofs.field.totalAmount")}
              isSorted={column.getIsSorted()}
              onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <p className="tabular font-medium">
              {row.original.currency} {row.original.total_amount ?? t("common.emptyValue")}
            </p>
            <p className="tabular text-xs text-muted-foreground">
              {t("paymentProofs.paid", { amount: row.original.amount_paid })}
            </p>
          </div>
        ),
      },
      {
        id: "payment_status",
        meta: { label: t("paymentProofs.field.paymentStatus") },
        header: () => t("paymentProofs.field.paymentStatus"),
        cell: ({ row }) => {
          const total = Number(row.original.total_amount ?? 0);
          const paid = Number(row.original.amount_paid ?? 0);
          const status =
            paid <= 0 ? "UNPAID" : total > 0 && paid >= total ? "PAID" : "PARTIAL";
          return (
            <StatusBadge
              label={t(`paymentProofs.status.${status}`)}
              tone={status === "PAID" ? "positive" : status === "PARTIAL" ? "warning" : "neutral"}
            />
          );
        },
      },
      {
        id: "proofs",
        meta: { label: t("paymentProofs.field.proofs") },
        header: () => t("paymentProofs.field.proofs"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <TypeBadge label={formatter.number(row.original.payments.length)} />
            {row.original.payments.some((payment) => payment.document) && (
              <FileText className="size-4 text-success" />
            )}
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("paymentProofs.action.viewProofs")}
              onClick={() => setViewing(row.original)}
            >
              <ReceiptText className="h-3.5 w-3.5" />
            </Button>
            {canOpenSettlement && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={t("paymentProofs.action.viewSettlement")}
              >
                <Link href={`/settlements/${row.original.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, df, formatter, canOpenSettlement],
  );

  const total = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("paymentProofs.title")}
        subtitle={
          isLoading ? t("common.loading") : t("paymentProofs.count", { count: total })
        }
        action={
          // The settlements listed, as a file (H16, HD13).
          <ExportButton
            disabled={total === 0}
            disabledReason={t("paymentProofs.count", { count: 0 })}
            title={t("paymentProofs.title")}
            onExport={(format) =>
              exportTransactions({
                format,
                title: t("paymentProofs.title"),
                subtitle: t("paymentProofs.count", { count: total }),
                query: list.query,
                columns: [
                  { key: "settlement_no", label: t("paymentProofs.field.settlementNo") },
                  { key: "dispatch_no", label: t("mySubmissions.field.dispatch_no") },
                  { key: "project_name", label: t("paymentProofs.field.project") },
                  { key: "recycler_name", label: t("mySubmissions.field.recycler") },
                  { key: "issued_at", label: t("paymentProofs.field.issuedAt") },
                  { key: "total_amount", label: t("paymentProofs.field.totalAmount") },
                  { key: "amount_paid", label: t("paymentProofs.field.amount") },
                ],
              })
            }
          />
        }
      />

      <FilterBar>
        {can("project.view") && (
          <ProjectPicker
            value={list.filters.project ?? "all"}
            onValueChange={(value) =>
              list.setFilter("project", value === "all" ? undefined : value)
            }
            placeholder={t("paymentProofs.filter.project")}
            allowAll
            allLabel={t("paymentProofs.filter.allProjects")}
            className="w-full sm:w-65"
          />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t("reports.filter.dateFrom")}
          </label>
          <Input
            type="date"
            className="w-full sm:w-44"
            value={list.filters.date_from ?? ""}
            onChange={(event) =>
              list.setFilter("date_from", event.target.value || undefined)
            }
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t("reports.filter.dateTo")}
          </label>
          <Input
            type="date"
            className="w-full sm:w-44"
            value={list.filters.date_to ?? ""}
            onChange={(event) =>
              list.setFilter("date_to", event.target.value || undefined)
            }
          />
        </div>
      </FilterBar>

      <DataTable
        onRowClick={setViewing}
        columns={columns}
        rows={data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={isLoading}
        isError={isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="trace-payment-proofs"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.state,
            onSelect: () => list.setFilter("state", undefined),
          },
          ...(["ISSUED", "LOCKED"] as const).map((state) => ({
            key: state,
            label: t(`settlements.state.${state}`),
            active: list.filters.state === state,
            onSelect: () => list.setFilter("state", state),
          })),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {viewing && <PaymentProofDialog settlement={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PaymentProofDialog({
  settlement,
  onClose,
}: {
  settlement: Settlement;
  onClose: () => void;
}) {
  const canOpenSettlement = useCanOpenSettlement();
  const t = useTranslations();
  const df = useDateFormat();

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("paymentProofs.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("paymentProofs.dialog.description", {
              settlement: settlement.settlement_no,
            })}
          </DialogDescription>
        </DialogHeader>
        {/* 预览 · 打印 · 导出 · 发送: the settlement and its payments (H16). */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <RecordExportButton kind="SETTLEMENT" recordId={settlement.id} reference={settlement.settlement_no} href="/payment-proofs" />
        </div>

        {settlement.payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
            {t("paymentProofs.dialog.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("paymentProofs.field.paidOn")}</TableHead>
                  <TableHead>{t("paymentProofs.field.method")}</TableHead>
                  <TableHead>{t("paymentProofs.field.reference")}</TableHead>
                  <TableHead className="text-right">{t("paymentProofs.field.amount")}</TableHead>
                  <TableHead>{t("paymentProofs.field.document")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlement.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="tabular">{df.date(payment.paid_on)}</TableCell>
                    <TableCell>
                      <TypeBadge label={t(`settlements.method.${payment.method}`)} />
                    </TableCell>
                    <TableCell>
                      <div className="max-w-45">
                        <p className="tabular truncate">
                          {payment.reference || t("common.emptyValue")}
                        </p>
                        {payment.notes && (
                          <p className="truncate text-xs text-muted-foreground" title={payment.notes}>
                            {payment.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {settlement.currency} {payment.amount}
                    </TableCell>
                    <TableCell>
                      {payment.document ? (
                        // The proof as a picture (J34-11): a photo itself, a PDF its type.
                        <FileThumbs
                          files={[
                            {
                              id: String(payment.id),
                              name: t("paymentProofs.action.openDocument"),
                              thumbnail_url: pictureByName(payment.document, payment.document),
                              href: payment.document,
                            },
                          ]}
                        />
                      ) : (
                        <span className="text-muted-foreground">{t("common.emptyValue")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 发送记录 (JB65): every send of this record, to whom and whether it went. */}
        <RecordSendLog recordKind="SETTLEMENT" recordId={settlement.id} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          {canOpenSettlement && (
            <Button asChild>
              <Link href={`/settlements/${settlement.id}`}>
                <Eye className="size-4" />
                {t("paymentProofs.action.viewSettlement")}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Whether this reader's portal opens /settlements (H16 second fix round).
 * A contractor's portal does not - the settlement page belongs to the
 * recycler's - so the 「查看结算」 links are not drawn for them; the
 * dialog's own 预览 · 打印 · 导出 · 发送 stays.
 */
function useCanOpenSettlement() {
  const { user } = useAuth();
  return Boolean(
    user && isRouteAllowed(user.portal, user.features, "/settlements", user.permissions, user.is_superuser),
  );
}
