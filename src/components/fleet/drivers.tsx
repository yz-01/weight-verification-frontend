"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { Driver } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { deleteDriver, getDrivers } from "@/services/recycler.service";

export function Drivers() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [removing, setRemoving] = useState<Driver | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["drivers", list.query],
    queryFn: () => getDrivers(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteDriver(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<Driver, unknown>[]>(
    () => [
      {
        accessorKey: "full_name",
        meta: { label: t("drivers.field.fullName") },
        header: ({ column }) => (
          <SortableHeader
            label={t("drivers.field.fullName")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.full_name}
          </span>
        ),
      },
      {
        accessorKey: "phone",
        meta: { label: t("drivers.field.phone") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("drivers.field.phone")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular">{row.original.phone}</span>
        ),
      },
      {
        accessorKey: "default_vehicle_plate",
        meta: { label: t("drivers.field.defaultVehicle") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("drivers.field.defaultVehicle")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.default_vehicle_plate ?? t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "licence_expires_on",
        meta: { label: t("drivers.field.licenceExpires") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("drivers.field.licenceExpires")}
          </span>
        ),
        cell: ({ row }) => {
          const expiry = row.original.licence_expires_on;
          if (!expiry) {
            return (
              <span className="text-muted-foreground">
                {t("common.emptyValue")}
              </span>
            );
          }
          // A driver on an expired licence is a legal problem for the yard, so
          // it is called out rather than left to be noticed.
          const expired = new Date(expiry) < new Date();
          return (
            <span
              className={
                expired
                  ? "inline-flex items-center gap-1.5 text-destructive"
                  : "tabular text-muted-foreground"
              }
              title={expired ? t("drivers.licenceExpired") : undefined}
            >
              {expired && <TriangleAlert className="h-3.5 w-3.5" />}
              <span className="tabular">{df.date(expiry)}</span>
            </span>
          );
        },
      },
      {
        accessorKey: "is_active",
        meta: { label: t("drivers.field.isActive") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("drivers.field.isActive")}
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
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) =>
          can("fleet.manage") ? (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={t("common.edit")}
              >
                <Link href={`/drivers/${row.original.id}/edit`}>
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
            </div>
          ) : null,
      },
    ],
    [t, df, can],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("drivers.title")}
        subtitle={isLoading ? "—" : t("drivers.count", { count: totalCount })}
        action={
          can("fleet.manage") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/drivers/create">
                <Plus className="h-4 w-4" />
                {t("drivers.new")}
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
        storageKey="drivers"
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
          title={t("drivers.remove.title", { name: removing.full_name })}
          description={t("drivers.remove.description")}
          confirmLabel={t("drivers.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
