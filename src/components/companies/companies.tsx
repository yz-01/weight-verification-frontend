"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Eye, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import type { CompanyRow, CompanyStatus } from "@/interfaces/company";
import { useDateFormat } from "@/lib/dates";
import {
  deleteCompany,
  getCompanies,
  updateCompanyStatus,
} from "@/services/companies.service";

const FILTER_KEYS = ["type", "status"];

/** How each lifecycle state reads in the status pill. */
const STATUS_TONE: Record<
  CompanyStatus,
  "positive" | "info" | "warning" | "danger" | "neutral"
> = {
  ACTIVE: "positive",
  TRIAL: "info",
  OVERDUE: "warning",
  SUSPENDED: "danger",
  CLOSED: "neutral",
};

type PendingAction =
  | { kind: "remove"; company: CompanyRow }
  | { kind: "suspend"; company: CompanyRow }
  | { kind: "reinstate"; company: CompanyRow };

export function Companies() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(FILTER_KEYS);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["companies", list.query],
    queryFn: () => getCompanies(list.query),
  });

  function closeDialog() {
    setPending(null);
    setReason("");
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["companies"] });
    closeDialog();
  };

  const removal = useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: invalidate,
  });

  const statusChange = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "ACTIVE" | "SUSPENDED";
    }) => updateCompanyStatus(id, { status, reason }),
    onSuccess: invalidate,
  });

  const columns = useMemo<ColumnDef<CompanyRow, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("companies.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.code")}
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
        meta: { label: t("companies.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.name")}
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
        accessorKey: "type",
        meta: { label: t("companies.field.type") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.type")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`companies.type.${row.original.type}`)} />
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("companies.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`companies.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "contact_person",
        meta: { label: t("companies.field.contactPerson") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("companies.field.contactPerson")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.contact_person || t("common.emptyValue")}
            </p>
            {row.original.contact_email && (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.contact_email}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "user_count",
        meta: { label: t("companies.field.userCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("companies.field.userCount")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular">{row.original.user_count}</span>
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("companies.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.createdAt")}
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
        header: () => (
          <span className="sr-only">{t("common.actions")}</span>
        ),
        cell: ({ row }) => {
          const company = row.original;
          const suspended =
            company.status === "SUSPENDED" || company.status === "CLOSED";
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10"
                title={t("common.view")}
              >
                <Link href={`/companies/${company.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>

              {can("company.update") && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/companies/${company.id}/edit`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}

              {can("company.suspend") &&
                (suspended ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    title={t("companies.reinstate.confirm")}
                    onClick={() => setPending({ kind: "reinstate", company })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-warning hover:bg-warning/10"
                    title={t("companies.suspend.confirm")}
                    onClick={() => setPending({ kind: "suspend", company })}
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                ))}

              {can("company.update") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={t("common.remove")}
                  onClick={() => setPending({ kind: "remove", company })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [t, can, df],
  );

  const filterPills = [
    {
      key: "all",
      label: t("companies.filter.all"),
      active: !list.filters.type && !list.filters.status,
      onSelect: () => {
        list.setFilter("type", undefined);
        list.setFilter("status", undefined);
      },
    },
    {
      key: "contractors",
      label: t("companies.filter.contractors"),
      active: list.filters.type === "CONTRACTOR",
      onSelect: () => list.setFilter("type", "CONTRACTOR"),
    },
    {
      key: "recyclers",
      label: t("companies.filter.recyclers"),
      active: list.filters.type === "RECYCLER",
      onSelect: () => list.setFilter("type", "RECYCLER"),
    },
    {
      key: "suspended",
      label: t("companies.filter.suspended"),
      active: list.filters.status === "SUSPENDED",
      onSelect: () => list.setFilter("status", "SUSPENDED"),
    },
  ];

  const totalCount = data?.count ?? 0;
  const isPending = removal.isPending || statusChange.isPending;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("companies.title")}
        subtitle={isLoading ? "—" : t("companies.count", { count: totalCount })}
        action={
          can("company.create") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/companies/create">
                <Plus className="h-4 w-4" />
                {t("companies.new")}
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
        storageKey="companies"
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
          title={t("companies.remove.title", { name: pending.company.name })}
          description={t("companies.remove.description")}
          confirmLabel={t("companies.remove.confirm")}
          isPending={isPending}
          onConfirm={() => removal.mutate(pending.company.id)}
        />
      )}

      {pending?.kind === "suspend" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          title={t("companies.suspend.title", { name: pending.company.name })}
          description={t("companies.suspend.description")}
          confirmLabel={t("companies.suspend.confirm")}
          isPending={isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() =>
            statusChange.mutate({
              id: pending.company.id,
              status: "SUSPENDED",
            })
          }
        />
      )}

      {pending?.kind === "reinstate" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          variant="default"
          title={t("companies.reinstate.title", { name: pending.company.name })}
          description={t("companies.reinstate.description")}
          confirmLabel={t("companies.reinstate.confirm")}
          isPending={isPending}
          onConfirm={() =>
            statusChange.mutate({ id: pending.company.id, status: "ACTIVE" })
          }
        />
      )}
    </div>
  );
}
