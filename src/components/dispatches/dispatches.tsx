"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import { useDateFormat } from "@/lib/dates";
import {
  DISPATCH_STATES,
  WASTE_TYPES,
  type DispatchState,
  type WasteDispatch,
} from "@/interfaces/contractor";
import {
  deleteDispatch,
  getDispatches,
  exportDispatches,
  type ExportFormat,
} from "@/services/contractor.service";

export const DISPATCH_STATE_TONE: Record<
  DispatchState,
  "neutral" | "info" | "warning" | "positive" | "danger"
> = {
  DRAFT: "neutral",
  PENDING_ACCEPTANCE: "warning",
  ACCEPTED: "info",
  RELEASED: "info",
  COLLECTED: "warning",
  WEIGHED: "info",
  SETTLED: "positive",
  CANCELLED: "danger",
};

export function Dispatches() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["state", "project", "waste_type"]);
  const [removing, setRemoving] = useState<WasteDispatch | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dispatches", list.query],
    queryFn: () => getDispatches(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteDispatch(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<WasteDispatch, unknown>[]>(
    () => [
      {
        accessorKey: "dispatch_no",
        meta: { label: t("dispatches.field.dispatchNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("dispatches.field.dispatchNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.dispatch_no}
          </span>
        ),
      },
      {
        accessorKey: "state",
        meta: { label: t("dispatches.field.state") },
        header: ({ column }) => (
          <SortableHeader
            label={t("dispatches.field.state")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`dispatches.state.${row.original.state}`)}
            tone={DISPATCH_STATE_TONE[row.original.state]}
          />
        ),
      },
      {
        accessorKey: "waste_type",
        meta: { label: t("dispatches.field.wasteType") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("dispatches.field.wasteType")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`dispatches.wasteType.${row.original.waste_type}`)} />
        ),
      },
      {
        accessorKey: "recycler_name",
        meta: { label: t("dispatches.field.recycler") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("dispatches.field.recycler")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate"
            title={row.original.recycler_name}
          >
            {row.original.recycler_name}
          </span>
        ),
      },
      {
        accessorKey: "estimated_weight_kg",
        meta: { label: t("dispatches.field.estimatedWeight") },
        header: ({ column }) => (
          <SortableHeader
            label={t("dispatches.field.estimatedWeight")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.estimated_weight_kg ?? t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "vehicle_plate",
        meta: { label: t("dispatches.field.vehiclePlate") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("dispatches.field.vehiclePlate")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular truncate">{row.original.vehicle_plate}</p>
            {row.original.driver_name && (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.driver_name}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "released_at",
        meta: { label: t("dispatches.field.releasedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("dispatches.field.releasedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.released_at
              ? df.date(row.original.released_at)
              : t("common.emptyValue")}
          </span>
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
              <Link href={`/dispatches/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {/*
              Both actions disappear once the load has left. The backend
              refuses either way; hiding them keeps the screen from offering
              something it will only reject.
            */}
            {can("dispatch.update") && row.original.is_editable && (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/dispatches/${row.original.id}/edit`}>
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
    [t, can, df],
  );

  const totalCount = data?.count ?? 0;
  const activeState = list.filters.state ?? "";

  /** The wording travels with the request; the backend holds no catalogue. */
  function runExport(format: ExportFormat) {
    return exportDispatches({
      format,
      title: t("dispatches.title"),
      subtitle: t("dispatches.count", { count: totalCount }),
      emptyLabel: t("table.noResults"),
      query: list.query,
      columns: [
        { key: "dispatch_no", label: t("dispatches.field.dispatchNo") },
        {
          key: "state",
          label: t("dispatches.field.state"),
          values: Object.fromEntries(
            DISPATCH_STATES.map((state) => [
              state,
              t(`dispatches.state.${state}`),
            ]),
          ),
        },
        { key: "released_at", label: t("dispatches.field.releasedAt") },
        { key: "project_code", label: t("dispatches.field.project") },
        { key: "recycler_name", label: t("dispatches.field.recycler") },
        {
          key: "waste_type",
          label: t("dispatches.field.wasteType"),
          values: Object.fromEntries(
            WASTE_TYPES.map((type) => [type, t(`dispatches.wasteType.${type}`)]),
          ),
        },
        {
          key: "estimated_weight_kg",
          label: t("dispatches.field.estimatedWeight"),
        },
        { key: "vehicle_plate", label: t("dispatches.field.vehiclePlate") },
        { key: "driver_name", label: t("dispatches.field.driverName") },
        { key: "released_by_name", label: t("dispatches.field.releasedBy") },
      ],
    });
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("dispatches.title")}
        subtitle={isLoading ? "—" : t("dispatches.count", { count: totalCount })}
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
        storageKey="dispatches"
        toolbarActions={
          can("report.export") ? (
            <ExportButton onExport={runExport} disabled={totalCount === 0} />
          ) : undefined
        }
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: activeState === "",
            onSelect: () => list.setFilter("state", undefined),
          },
          ...(
            ["DRAFT", "RELEASED", "COLLECTED", "SETTLED", "CANCELLED"] as const
          ).map((state) => ({
            key: state,
            label: t(`dispatches.state.${state}`),
            active: activeState === state,
            onSelect: () => list.setFilter("state", state),
          })),
        ]}
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
          title={t("dispatches.remove.title", { name: removing.dispatch_no })}
          description={t("dispatches.remove.description")}
          confirmLabel={t("dispatches.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
