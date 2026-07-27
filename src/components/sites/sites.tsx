"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
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
import type { RecyclingSite } from "@/interfaces/weighing";
import { deleteSite, getSites } from "@/services/weighing.service";
import { useDateFormat } from "@/lib/dates";

export function Sites() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [removing, setRemoving] = useState<RecyclingSite | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sites", list.query],
    queryFn: () => getSites(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteSite(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<RecyclingSite, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("sites.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("sites.field.code")}
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
        meta: { label: t("sites.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("sites.field.name")}
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
        accessorKey: "scale_count",
        meta: { label: t("sites.field.scaleCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sites.field.scaleCount")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.scale_count ?? 0)} />
        ),
      },
      {
        accessorKey: "city",
        meta: { label: t("sites.field.city") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sites.field.city")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.city || t("common.emptyValue")}
            </p>
            {row.original.state && (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.state}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "is_active",
        meta: { label: t("sites.field.isActive") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sites.field.isActive")}
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
        accessorKey: "created_at",
        meta: { label: t("sites.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("sites.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.created_at)}
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
              <Link href={`/sites/${row.original.id}/edit`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {can("scale.manage") && (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/sites/${row.original.id}/edit`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                  // A yard with weighbridges on it cannot go: their sessions
                  // point at both, and removing one would strand the other.
                  disabled={(row.original.scale_count ?? 0) > 0}
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

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("sites.title")}
        subtitle={isLoading ? "—" : t("sites.count", { count: totalCount })}
        action={
          can("scale.manage") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/sites/create">
                <Plus className="h-4 w-4" />
                {t("sites.new")}
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
        storageKey="sites"
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
          title={t("sites.remove.title", { name: removing.name })}
          description={t("sites.remove.description")}
          confirmLabel={t("sites.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
