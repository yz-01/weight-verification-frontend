"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowRightLeft,
  Ban,
  Eye,
  KeyRound,
  LogOut,
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
import { UserHandoverDialog } from "@/components/users/user-handover-dialog";
import { Input } from "@/components/ui/input";
import { useListQuery } from "@/hooks/use-list-query";
import type { UserRow, UserStatus } from "@/interfaces/auth";
import { useDateFormat } from "@/lib/dates";
import {
  deleteUser,
  forceLogoutUser,
  getUserStats,
  getUsers,
  sendPasswordReset,
  updateUserStatus,
} from "@/services/users.service";
import { getCompanies } from "@/services/companies.service";

const FILTER_KEYS = [
  "status",
  "audience",
  "company",
  "created_from",
  "created_to",
];

const STATUS_TONE: Record<UserStatus, "positive" | "warning" | "danger"> = {
  ACTIVE: "positive",
  INVITED: "warning",
  SUSPENDED: "danger",
};

type PendingAction =
  | { kind: "remove"; user: UserRow }
  | { kind: "suspend"; user: UserRow }
  | { kind: "reinstate"; user: UserRow }
  | { kind: "force-logout"; user: UserRow }
  | { kind: "handover"; user: UserRow };

export type UserManagementSection =
  "management" | "profiles" | "categories" | "search" | "login" | "statistics";

const ADMIN_SECTION_COLUMNS: Record<UserManagementSection, string[]> = {
  management: [
    "full_name",
    "company_name",
    "audience",
    "status",
    "last_login_at",
    "created_at",
    "actions",
  ],
  profiles: [
    "full_name",
    "phone",
    "company_name",
    "audience",
    "status",
    "created_at",
    "actions",
  ],
  categories: [
    "full_name",
    "company_name",
    "audience",
    "status",
    "created_at",
    "actions",
  ],
  search: [
    "full_name",
    "phone",
    "company_name",
    "audience",
    "status",
    "last_login_at",
    "created_at",
    "actions",
  ],
  login: ["full_name", "company_name", "status", "last_login_at", "actions"],
  statistics: [
    "full_name",
    "company_name",
    "audience",
    "status",
    "created_at",
    "actions",
  ],
};

export function Users({
  section = "management",
}: {
  section?: UserManagementSection;
}) {
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
    enabled: section !== "statistics",
  });
  const stats = useQuery({
    queryKey: ["users", "stats"],
    queryFn: () => getUserStats(),
  });
  const companies = useQuery({
    queryKey: ["companies", "user-filter"],
    queryFn: () => getCompanies({ page_size: 500, sort_by: "name" }),
    enabled: Boolean(me?.is_platform_staff),
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
      updateUserStatus(id, {
        status: status as "ACTIVE" | "SUSPENDED",
        reason,
      }),
    onSuccess: invalidate,
  });

  const resetLink = useMutation({
    // The action from the list is "resend the sign-in link". The backend picks
    // invite versus reset by the user's state; the wording here matches the
    // reset case, which is what this control is for — a user who cannot get in.
    mutationFn: (id: string) =>
      sendPasswordReset(id, {
        subject: t("email.reset.subject"),
        body: t("email.reset.body"),
      }),
  });
  const forceLogout = useMutation({
    mutationFn: (id: string) => forceLogoutUser(id),
    onSuccess: invalidate,
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
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
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
        accessorKey: "company_name",
        meta: { label: t("users.field.company") },
        header: () => t("users.field.company"),
        cell: ({ row }) =>
          row.original.company_name || t("users.audience.PLATFORM"),
      },
      {
        id: "audience",
        meta: { label: t("users.field.audience") },
        header: () => t("users.field.audience"),
        cell: ({ row }) =>
          t(`users.audience.${row.original.company_type ?? "PLATFORM"}`),
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
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
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
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
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
        accessorKey: "created_at",
        meta: { label: t("users.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("users.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {df.date(row.original.created_at)}
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
                target.company_type === "CONTRACTOR" &&
                target.status !== "SUSPENDED" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-primary hover:bg-primary/10"
                    title={t("userHandover.action.open")}
                    onClick={() =>
                      setPending({ kind: "handover", user: target })
                    }
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </Button>
                )}

              {can("user.suspend") && !isSelf && target.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title={t("users.forceLogout.action")}
                  onClick={() =>
                    setPending({ kind: "force-logout", user: target })
                  }
                >
                  <LogOut className="h-3.5 w-3.5" />
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
                    onClick={() =>
                      setPending({ kind: "reinstate", user: target })
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-warning hover:bg-warning/10"
                    title={t("users.suspend.confirm")}
                    onClick={() =>
                      setPending({ kind: "suspend", user: target })
                    }
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                ))}

              {can("user.suspend") && !isSelf && !target.last_login_at && (
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

  const totalCount =
    section === "statistics" ? (stats.data?.total ?? 0) : (data?.count ?? 0);
  const isPending =
    removal.isPending || statusChange.isPending || forceLogout.isPending;
  const visibleColumns = useMemo(
    () =>
      me?.is_platform_staff
        ? columns.filter((column) => {
            const id =
              column.id ??
              ("accessorKey" in column ? String(column.accessorKey) : "");
            return ADMIN_SECTION_COLUMNS[section].includes(id);
          })
        : columns,
    [columns, me?.is_platform_staff, section],
  );

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={
          me?.is_platform_staff
            ? t(`users.module.${section}.title`)
            : t("users.title")
        }
        subtitle={
          isLoading
            ? "—"
            : me?.is_platform_staff
              ? t(`users.module.${section}.subtitle`, { count: totalCount })
              : t("users.count", { count: totalCount })
        }
        action={
          can("user.create") && section === "management" ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/users/create">
                <Plus className="h-4 w-4" />
                {t("users.new")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {me?.is_platform_staff &&
        (section === "categories" || section === "statistics") && (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 xl:grid-cols-6">
            {(
              [
                "total",
                "platform",
                "contractor",
                "recycler",
                "online",
                "suspended",
              ] as const
            ).map((key) => {
              const value =
                key === "platform"
                  ? stats.data?.by_audience.PLATFORM
                  : key === "contractor"
                    ? stats.data?.by_audience.CONTRACTOR
                    : key === "recycler"
                      ? stats.data?.by_audience.RECYCLER
                      : stats.data?.[key];
              return (
                <div key={key} className="bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t(`users.summary.${key}`)}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {value ?? 0}
                  </p>
                </div>
              );
            })}
          </div>
        )}

      {section !== "statistics" && me?.is_platform_staff && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={list.filters.audience ?? ""}
              onChange={(event) =>
                list.setFilter("audience", event.target.value || undefined)
              }
              aria-label={t("users.filter.audience")}
            >
              <option value="">{t("users.filter.allAudiences")}</option>
              {(["PLATFORM", "CONTRACTOR", "RECYCLER"] as const).map(
                (audience) => (
                  <option key={audience} value={audience}>
                    {t(`users.audience.${audience}`)}
                  </option>
                ),
              )}
            </select>
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={list.filters.company ?? ""}
              onChange={(event) =>
                list.setFilter("company", event.target.value || undefined)
              }
              aria-label={t("users.filter.company")}
            >
              <option value="">{t("users.filter.allCompanies")}</option>
              {(companies.data?.results ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={list.filters.created_from ?? ""}
              onChange={(event) =>
                list.setFilter("created_from", event.target.value || undefined)
              }
              aria-label={t("users.filter.createdFrom")}
            />
            <Input
              type="date"
              value={list.filters.created_to ?? ""}
              onChange={(event) =>
                list.setFilter("created_to", event.target.value || undefined)
              }
              aria-label={t("users.filter.createdTo")}
            />
          </div>
        </>
      )}

      {section !== "statistics" && (
        <DataTable
          columns={visibleColumns}
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
          storageKey={
            me?.is_platform_staff ? `admin-users-${section}` : "users"
          }
          filterPills={filterPills}
          onSearchChange={list.setSearch}
          onSortChange={list.setSort}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          onClearFilters={list.clearFilters}
        />
      )}

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

      {pending?.kind === "handover" && (
        <UserHandoverDialog
          outgoing={pending.user}
          onClose={closeDialog}
          onSaved={invalidate}
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
          title={t("companies.reinstate.title", {
            name: pending.user.full_name,
          })}
          description={t("users.reinstate.description")}
          confirmLabel={t("companies.reinstate.confirm")}
          confirmIcon={UserPlus}
          isPending={isPending}
          onConfirm={() =>
            statusChange.mutate({ id: pending.user.id, status: "ACTIVE" })
          }
        />
      )}

      {pending?.kind === "force-logout" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          variant="default"
          title={t("users.forceLogout.title", { name: pending.user.full_name })}
          description={t("users.forceLogout.description")}
          confirmLabel={t("users.forceLogout.confirm")}
          confirmIcon={LogOut}
          isPending={isPending}
          onConfirm={() => forceLogout.mutate(pending.user.id)}
        />
      )}
    </div>
  );
}
