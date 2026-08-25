"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { Driver, DriverWorkStatus } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import {
  deleteDriver,
  getDrivers,
  getDriverSummary,
} from "@/services/recycler.service";

const WORK_STATUSES: DriverWorkStatus[] = [
  "AVAILABLE",
  "ON_TASK",
  "COMPLETED_TODAY",
  "ON_LEAVE",
  "INACTIVE",
];

export function Drivers() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["work_status"]);
  const [removing, setRemoving] = useState<Driver | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["drivers", list.query],
    queryFn: () => getDrivers(list.query),
  });
  const summary = useQuery({
    queryKey: ["drivers", "summary"],
    queryFn: getDriverSummary,
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
        accessorKey: "work_status",
        meta: { label: t("drivers.field.workStatus") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("drivers.field.workStatus")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`drivers.status.${row.original.work_status}`)}
            tone={driverStatusTone(row.original.work_status)}
          />
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
                <Link href={`/drivers/${row.original.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>
              {can("fleet.manage") && (
                <>
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
                </>
              )}
            </div>
          ),
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

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(["total", "online", "on_task", "available", "on_leave", "inactive"] as const).map(
          (key) => (
            <div key={key} className="rounded-lg border bg-card px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{t(`drivers.summary.${key}`)}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {summary.data?.[key] ?? "—"}
              </p>
            </div>
          ),
        )}
      </div>

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
        filterPills={WORK_STATUSES.map((status) => ({
          key: status,
          label: t(`drivers.status.${status}`),
          active: list.filters.work_status === status,
          onSelect: () =>
            list.setFilter(
              "work_status",
              list.filters.work_status === status ? undefined : status,
            ),
        }))}
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

function driverStatusTone(status: DriverWorkStatus) {
  if (status === "AVAILABLE" || status === "COMPLETED_TODAY") return "positive" as const;
  if (status === "ON_TASK") return "info" as const;
  if (status === "ON_LEAVE") return "warning" as const;
  return "neutral" as const;
}
