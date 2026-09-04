"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import { roleDescription, roleName } from "@/lib/role-labels";
import type { Role } from "@/interfaces/auth";
import { deleteRole, getRoles } from "@/services/users.service";

export function Roles() {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery();

  const [removing, setRemoving] = useState<Role | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["roles", list.query],
    queryFn: () => getRoles(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<Role, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { label: t("roles.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("roles.field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {roleName(row.original, t)}
            </span>
            {row.original.is_system && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground ring-1 ring-inset ring-border"
                title={t("roles.systemHint")}
              >
                <Lock className="h-2.5 w-2.5" />
                {t("roles.system")}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "code",
        meta: { label: t("roles.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("roles.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: "permissions",
        meta: { label: t("roles.field.permissions") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("roles.field.permissions")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge
            label={t("roles.permissionCount", {
              count: row.original.permissions.length,
            })}
          />
        ),
      },
      {
        accessorKey: "user_count",
        meta: { label: t("roles.field.userCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("roles.field.userCount")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular">{row.original.user_count ?? 0}</span>
        ),
      },
      {
        accessorKey: "description",
        meta: { label: t("roles.field.description") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("roles.field.description")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[280px] truncate text-muted-foreground"
            title={roleDescription(row.original, t)}
          >
            {roleDescription(row.original, t) || t("common.emptyValue")}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => {
          const role = row.original;
          const inUse = (role.user_count ?? 0) > 0;
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10"
                title={t("common.view")}
              >
                <Link href={`/roles/${role.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>

              {can("role.update") && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/roles/${role.id}/edit`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}

              {can("role.delete") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                  // Disabled rather than hidden, with the reason in the tooltip:
                  // a button that vanishes leaves the user wondering whether
                  // they lack the permission or the action is unavailable.
                  disabledReason={role.is_system ? t("roles.remove.blockedBySystem") : inUse ? t("roles.remove.blockedByUsers") : undefined}
                  disabled={role.is_system || inUse}
                  title={
                    role.is_system
                      ? t("roles.remove.blockedBySystem")
                      : inUse
                        ? t("roles.remove.blockedByUsers")
                        : t("common.remove")
                  }
                  onClick={() => setRemoving(role)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [t, can],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("roles.title")}
        subtitle={isLoading ? "—" : t("roles.count", { count: totalCount })}
        action={
          can("role.create") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/roles/create">
                <Plus className="h-4 w-4" />
                {t("roles.new")}
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
        storageKey="roles"
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
          title={t("roles.remove.title", { name: roleName(removing, t) })}
          description={t("roles.remove.description")}
          confirmLabel={t("roles.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
