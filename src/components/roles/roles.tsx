"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Info, Layers, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { AddPresetRoleDialog } from "@/components/roles/add-preset-role";
import { rolePermissionSummary, roleTypeLabel } from "@/components/roles/role-summary";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import { roleDescription, roleName } from "@/lib/role-labels";
import type { Role } from "@/interfaces/auth";
import { deleteRole, getRoles } from "@/services/users.service";

export function Roles() {
  const router = useRouter();
  const t = useTranslations();
  const { can, user: me } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery();
  // JB219 (客户 11-18 事项 4): a builder makes and names its own roles - no
  // 「从预设新增」, no raw 代号 column, the type in the client's words instead.
  // A recycler's page is unchanged.
  const builder = me?.portal === "MSE_TRACE";

  const [removing, setRemoving] = useState<Role | null>(null);
  const [addingPreset, setAddingPreset] = useState(false);

  // The phone's three roles are made and chosen in 现场人员管理 (客户 11-06),
  // so this page lists the office roles only.
  const query = useMemo(() => ({ ...list.query, kind: "office" }), [list.query]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["roles", query],
    queryFn: () => getRoles(query),
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
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border"
                title={t("roles.systemHint")}
              >
                <Lock className="h-2.5 w-2.5" />
                {t("roles.system")}
              </span>
            )}
          </div>
        ),
      },
      ...(builder
        ? [
            {
              id: "kind",
              meta: { label: t("roles.field.kind") },
              header: () => (
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("roles.field.kind")}
                </span>
              ),
              cell: ({ row }) => (
                <span className="text-sm text-foreground">
                  {roleTypeLabel(row.original, t) ?? t("common.emptyValue")}
                </span>
              ),
            } satisfies ColumnDef<Role, unknown>,
          ]
        : [
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
            } satisfies ColumnDef<Role, unknown>,
          ]),
      {
        accessorKey: "permissions",
        meta: { label: t("roles.field.permissions") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("roles.field.permissions")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={rolePermissionSummary(row.original, t)} />
        ),
      },
      {
        accessorKey: "user_count",
        meta: { label: t("roles.field.userCount") },
        header: () => (
          <span className="block text-right text-xs font-semibold text-muted-foreground">
            {t("roles.field.userCount")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular block text-right">{row.original.user_count ?? 0}</span>
        ),
      },
      {
        accessorKey: "description",
        meta: { label: t("roles.field.description") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("roles.field.description")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-70 truncate text-muted-foreground"
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
    [t, can, builder],
  );

  const totalCount = data?.count ?? 0;
  // Nothing but 公司管理员 yet (a new builder): say what to do next.
  const onlyAdmin =
    !isLoading &&
    !isError &&
    !list.search &&
    totalCount === 1 &&
    data?.results.every((role) => role.is_system) === true;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("roles.title")}
        subtitle={isLoading ? "—" : t("roles.count", { count: totalCount })}
        action={
          can("role.create") ? (
            <div className="flex flex-wrap items-center gap-2">
              {!builder && (
                <Button variant="outline" onClick={() => setAddingPreset(true)}>
                  <Layers className="size-4" />
                  {t("roles.preset.open")}
                </Button>
              )}
              <Button asChild>
                <Link href="/roles/create">
                  <Plus className="size-4" />
                  {t("roles.new")}
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {builder && (
        <div className="space-y-2" data-roles-help>
          <p className="flex gap-2 text-sm leading-6 text-muted-foreground">
            <Info className="mt-1 size-4 shrink-0" />
            <span>{t("roles.phoneHere")}</span>
          </p>
          {onlyAdmin && (
            <p
              role="status"
              data-roles-only-admin
              className="rounded-lg border border-info/25 bg-info/8 px-3 py-2 text-sm leading-6 text-foreground"
            >
              {t("roles.onlyAdmin")}
            </p>
          )}
        </div>
      )}

      <DataTable
        onRowClick={(row) => router.push(`/roles/${row.id}`)}
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

      {addingPreset && (
        <AddPresetRoleDialog onClose={() => setAddingPreset(false)} />
      )}

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
