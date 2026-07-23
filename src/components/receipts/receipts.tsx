"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Eye, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { MaterialReceipt } from "@/interfaces/contractor";
import { deleteReceipt, getReceipts } from "@/services/contractor.service";

export function Receipts() {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["project", "supplier", "unit"]);
  const [removing, setRemoving] = useState<MaterialReceipt | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipts", list.query],
    queryFn: () => getReceipts(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteReceipt(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
      setRemoving(null);
    },
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
              {format(new Date(row.original.captured_at), "dd MMM yyyy")}
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
            {can("receipt.update") && (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/receipts/${row.original.id}/edit`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={t("common.remove")}
                  onClick={() => setRemoving(row.original)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [t, can],
  );

  const totalCount = data?.count ?? 0;

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
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={t("receipts.remove.title", { name: removing.receipt_no })}
          description={t("receipts.remove.description")}
          confirmLabel={t("receipts.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
