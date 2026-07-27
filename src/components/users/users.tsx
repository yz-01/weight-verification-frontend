"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Ban,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { UserRow, UserStatus } from "@/interfaces/auth";
import { useDateFormat } from "@/lib/dates";
import {
  deleteUser,
  getUsers,
  sendPasswordReset,
  updateUserStatus,
} from "@/services/users.service";

const FILTER_KEYS = ["status"];

const STATUS_TONE: Record<UserStatus, "positive" | "warning" | "danger"> = {
  ACTIVE: "positive",
  INVITED: "warning",
  SUSPENDED: "danger",
};

type PendingAction =
  | { kind: "remove"; user: UserRow }
  | { kind: "suspend"; user: UserRow }
  | { kind: "reinstate"; user: UserRow };

export function Users() {
  const t = useTranslations();
  const df = useDateFormat();
  const { user: me, can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(FILTER_KEYS);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["users", list.query],
    queryFn: () => getUsers(list.query),
  });

  function closeDialog() {
    setPending(null);
    setReason("");
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    closeDialog();
  };

  const removal = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: invalidate,
  });

  const statusChange = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      updateUserStatus(id, { status: status as "ACTIVE" | "SUSPENDED", reason }),
    onSuccess: invalidate,
  });

  const resetLink = useMutation({
    mutationFn: (id: string) => sendPasswordReset(id),
  });

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        accessorKey: "full_name",
        meta: { label: t("users.field.fullName") },
        header: ({ column }) => (
          <SortableHeader
            label={t("users.field.fullName")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-[220px] truncate font-medium text-foreground"
              title={row.original.full_name}
            >
              {row.original.full_name}
            </p>
            <p className="max-w-[220px] truncate text-xs text-muted-foreground">
              {row.original.email}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "role_name",
        meta: { label: t("users.field.role") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("users.field.role")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.role_name ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
              {row.original.role_name}
            </span>
          ) : (
            <span className="italic text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        accessorKey: "status",
        meta: { label: t("users.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("users.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`users.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "phone",
        meta: { label: t("users.field.phone") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("users.field.phone")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.phone || (
            <span className="italic text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        accessorKey: "last_login_at",
        meta: { label: t("users.field.lastLoginAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("users.field.lastLoginAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) =>
          row.original.last_login_at ? (
            <span className="tabular text-muted-foreground">
              {df.date(row.original.last_login_at)}
            </span>
          ) : (
            <span className="italic text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => {
          const target = row.original;
          // A user must not be able to lock themselves out from the list they
          // are looking at. Their own row keeps view and edit only.
          const isSelf = target.id === me?.id;
          const suspended = target.status === "SUSPENDED";
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10"
                title={t("common.view")}
              >
                <Link href={`/users/${target.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>

              {can("user.update") && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/users/${target.id}/edit`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}

              {can("user.update") && !isSelf && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t("users.resetPassword.action")}
                  disabled={resetLink.isPending}
                  onClick={() => resetLink.mutate(target.id)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
              )}

              {can("user.suspend") &&
                !isSelf &&
                (suspended ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    title={t("companies.reinstate.confirm")}
                    onClick={() => setPending({ kind: "reinstate", user: target })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-warning hover:bg-warning/10"
                    title={t("users.suspend.confirm")}
                    onClick={() => setPending({ kind: "suspend", user: target })}
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                ))}

              {can("user.suspend") && !isSelf && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={t("common.remove")}
                  onClick={() => setPending({ kind: "remove", user: target })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [t, can, df, me?.id, resetLink],
  );

  const filterPills = [
    {
      key: "all",
      label: t("common.all"),
      active: !list.filters.status,
      onSelect: () => list.setFilter("status", undefined),
    },
    {
      key: "active",
      label: t("users.status.ACTIVE"),
      active: list.filters.status === "ACTIVE",
      onSelect: () => list.setFilter("status", "ACTIVE"),
    },
    {
      key: "invited",
      label: t("users.status.INVITED"),
      active: list.filters.status === "INVITED",
      onSelect: () => list.setFilter("status", "INVITED"),
    },
    {
      key: "suspended",
      label: t("users.status.SUSPENDED"),
      active: list.filters.status === "SUSPENDED",
      onSelect: () => list.setFilter("status", "SUSPENDED"),
    },
  ];

  const totalCount = data?.count ?? 0;
  const isPending = removal.isPending || statusChange.isPending;
  // Platform staff browsing without a company are looking at MSE Trace's own
  // people, which is a different screen in the client's terms.
  const title = me?.is_platform_staff ? t("users.titleStaff") : t("users.title");

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={title}
        subtitle={isLoading ? "—" : t("users.count", { count: totalCount })}
        action={
          can("user.create") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/users/create">
                <Plus className="h-4 w-4" />
                {t("users.new")}
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
        storageKey="users"
        filterPills={filterPills}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {pending?.kind === "remove" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          title={t("users.remove.title", { name: pending.user.full_name })}
          description={t("users.remove.description")}
          confirmLabel={t("users.remove.confirm")}
          confirmIcon={Trash2}
          isPending={isPending}
          onConfirm={() => removal.mutate(pending.user.id)}
        />
      )}

      {pending?.kind === "suspend" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          title={t("users.suspend.title", { name: pending.user.full_name })}
          description={t("users.suspend.description")}
          confirmLabel={t("users.suspend.confirm")}
          confirmIcon={Ban}
          isPending={isPending}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={() =>
            statusChange.mutate({ id: pending.user.id, status: "SUSPENDED" })
          }
        />
      )}

      {pending?.kind === "reinstate" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          variant="default"
          title={t("companies.reinstate.title", { name: pending.user.full_name })}
          description={t("users.reinstate.description")}
          confirmLabel={t("companies.reinstate.confirm")}
          confirmIcon={UserPlus}
          isPending={isPending}
          onConfirm={() =>
            statusChange.mutate({ id: pending.user.id, status: "ACTIVE" })
          }
        />
      )}
    </div>
  );
}
