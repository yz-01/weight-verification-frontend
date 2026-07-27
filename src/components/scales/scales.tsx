"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Pencil, Plus, RadioTower, Trash2, TriangleAlert } from "lucide-react";
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
import type { Scale } from "@/interfaces/weighing";
import { deleteScale, getScales } from "@/services/weighing.service";

export function Scales() {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [removing, setRemoving] = useState<Scale | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["scales", list.query],
    queryFn: () => getScales(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteScale(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scales"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<Scale, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("scales.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("scales.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="tabular font-medium text-foreground">
              {row.original.code}
            </span>
            {/* Surfaced in the list, not buried in the record: a weighing taken
                on a lapsed certificate is not evidence of anything, and nobody
                goes looking for an expiry date they have not been shown. */}
            {row.original.calibration_expired && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-destructive ring-1 ring-inset ring-destructive/25"
                title={t("scales.calibrationHint")}
              >
                <TriangleAlert className="h-2.5 w-2.5" />
                {t("scales.calibrationExpired")}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "name",
        meta: { label: t("scales.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("scales.field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[220px] truncate font-medium text-foreground">
              {row.original.name}
            </p>
            <p className="max-w-[220px] truncate text-xs text-muted-foreground">
              {row.original.site_name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "protocol",
        meta: { label: t("scales.field.protocol") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("scales.field.protocol")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge
            label={t(`scales.protocolLabel.${row.original.protocol}`)}
          />
        ),
      },
      {
        accessorKey: "capacity_kg",
        meta: { label: t("scales.field.capacityKg") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("scales.field.capacityKg")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.capacity_kg ? (
            <span className="tabular">
              {Number(row.original.capacity_kg).toLocaleString()}
            </span>
          ) : (
            <span className="italic text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        accessorKey: "gateway_count",
        meta: { label: t("scales.field.gatewayCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("scales.field.gatewayCount")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <RadioTower className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="tabular">{row.original.gateway_count ?? 0}</span>
          </span>
        ),
      },
      {
        accessorKey: "calibration_expiry",
        meta: { label: t("scales.field.calibrationExpiry") },
        header: ({ column }) => (
          <SortableHeader
            label={t("scales.field.calibrationExpiry")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) =>
          row.original.calibration_expiry ? (
            <span
              className={
                row.original.calibration_expired
                  ? "tabular font-medium text-destructive"
                  : "tabular text-muted-foreground"
              }
            >
              {format(
                new Date(row.original.calibration_expiry),
                "dd MMM yyyy",
              )}
            </span>
          ) : (
            <span className="italic text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        accessorKey: "is_active",
        meta: { label: t("scales.field.isActive") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("scales.field.isActive")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={
              row.original.is_active
                ? t("companies.status.ACTIVE")
                : t("users.status.SUSPENDED")
            }
            tone={row.original.is_active ? "positive" : "neutral"}
          />
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            {can("scale.manage") && (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/scales/${row.original.id}/edit`}>
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
        title={t("scales.title")}
        subtitle={isLoading ? "—" : t("scales.count", { count: totalCount })}
        action={
          can("scale.manage") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/scales/create">
                <Plus className="h-4 w-4" />
                {t("scales.new")}
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
        storageKey="scales"
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
          title={t("scales.remove.title", { name: removing.name })}
          description={t("scales.remove.description")}
          confirmLabel={t("scales.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
