"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { Supplier } from "@/interfaces/contractor";
import { deleteSupplier, getSuppliers } from "@/services/contractor.service";

export function Suppliers() {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [removing, setRemoving] = useState<Supplier | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["suppliers", list.query],
    queryFn: () => getSuppliers(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("suppliers.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("suppliers.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: "name",
        meta: { label: t("suppliers.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("suppliers.field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[240px] truncate font-medium text-foreground"
            title={row.original.name}
          >
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "contact_person",
        meta: { label: t("suppliers.field.contactPerson") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("suppliers.field.contactPerson")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.contact_person || t("common.emptyValue")}
            </p>
            {row.original.contact_phone && (
              <p className="tabular truncate text-xs text-muted-foreground">
                {row.original.contact_phone}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "qr_code_count",
        meta: { label: t("suppliers.field.qrCodeCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("suppliers.field.qrCodeCount")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.qr_code_count ?? 0)} />
        ),
      },
      {
        accessorKey: "is_active",
        meta: { label: t("suppliers.field.isActive") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("suppliers.field.isActive")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={
              row.original.is_active
                ? t("projects.status.ACTIVE")
                : t("qrCodes.status.revoked")
            }
            tone={row.original.is_active ? "positive" : "neutral"}
          />
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("suppliers.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("suppliers.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {format(new Date(row.original.created_at), "dd MMM yyyy")}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            {can("supplier.update") && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={t("common.edit")}
              >
                <Link href={`/suppliers/${row.original.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            {can("supplier.delete") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                title={t("common.remove")}
                onClick={() => setRemoving(row.original)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
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
        title={t("suppliers.title")}
        subtitle={isLoading ? "—" : t("suppliers.count", { count: totalCount })}
        action={
          can("supplier.create") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/suppliers/create">
                <Plus className="h-4 w-4" />
                {t("suppliers.new")}
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
        storageKey="suppliers"
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
          title={t("suppliers.remove.title", { name: removing.name })}
          description={t("suppliers.remove.description")}
          confirmLabel={t("suppliers.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
