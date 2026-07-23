"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { useListQuery } from "@/hooks/use-list-query";
import type { LoginOutcome, LoginRecord } from "@/interfaces/auth";
import { getLoginRecords } from "@/services/users.service";

const FILTER_KEYS = ["outcome"];

const OUTCOME_TONE: Record<LoginOutcome, "positive" | "danger" | "warning"> = {
  SUCCESS: "positive",
  BAD_CREDENTIALS: "danger",
  USER_SUSPENDED: "warning",
  COMPANY_SUSPENDED: "warning",
};

/**
 * Sign-in history.
 *
 * Failures are recorded as specifically as the platform can afford to, because
 * a run of BAD_CREDENTIALS against one address reads very differently from a
 * run of COMPANY_SUSPENDED, and only the first is worth investigating.
 */
export function LoginRecords() {
  const t = useTranslations();
  const list = useListQuery(FILTER_KEYS);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["login-records", list.query],
    queryFn: () => getLoginRecords(list.query),
  });

  const columns = useMemo<ColumnDef<LoginRecord, unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        meta: { label: t("loginRecords.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("loginRecords.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap text-muted-foreground">
            {format(new Date(row.original.created_at), "dd MMM yyyy HH:mm:ss")}
          </span>
        ),
      },
      {
        accessorKey: "email_attempted",
        meta: { label: t("loginRecords.field.email") },
        header: ({ column }) => (
          <SortableHeader
            label={t("loginRecords.field.email")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[240px] truncate">
              {row.original.email_attempted}
            </p>
            {row.original.user_name && (
              <p className="text-xs text-muted-foreground">
                {row.original.user_name}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "outcome",
        meta: { label: t("loginRecords.field.outcome") },
        header: ({ column }) => (
          <SortableHeader
            label={t("loginRecords.field.outcome")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`loginRecords.outcome.${row.original.outcome}`)}
            tone={OUTCOME_TONE[row.original.outcome]}
          />
        ),
      },
      {
        accessorKey: "ip_address",
        meta: { label: t("loginRecords.field.ipAddress") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("loginRecords.field.ipAddress")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.ip_address ?? t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "user_agent",
        meta: { label: t("loginRecords.field.userAgent") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("loginRecords.field.userAgent")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[320px] truncate text-xs text-muted-foreground"
            title={row.original.user_agent}
          >
            {row.original.user_agent || t("common.emptyValue")}
          </span>
        ),
      },
    ],
    [t],
  );

  const filterPills = [
    {
      key: "all",
      label: t("common.all"),
      active: !list.filters.outcome,
      onSelect: () => list.setFilter("outcome", undefined),
    },
    {
      key: "SUCCESS",
      label: t("loginRecords.outcome.SUCCESS"),
      active: list.filters.outcome === "SUCCESS",
      onSelect: () => list.setFilter("outcome", "SUCCESS"),
    },
    {
      key: "BAD_CREDENTIALS",
      label: t("loginRecords.outcome.BAD_CREDENTIALS"),
      active: list.filters.outcome === "BAD_CREDENTIALS",
      onSelect: () => list.setFilter("outcome", "BAD_CREDENTIALS"),
    },
  ];

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("loginRecords.title")}
        subtitle={
          isLoading ? "—" : t("loginRecords.count", { count: totalCount })
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
        storageKey="login-records"
        filterPills={filterPills}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}
