"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

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
import { getCompanies } from "@/services/companies.service";

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

export function ContractorPartners() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery(["status"]);
  const query = useMemo(
    () => ({ ...list.query, type: "CONTRACTOR" as const }),
    [list.query],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["companies", "contractor-partners", query],
    queryFn: () => getCompanies(query),
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
        accessorKey: "plan_name",
        meta: { label: t("contractorPartners.field.plan") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("contractorPartners.field.plan")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.plan_name ?? t("common.emptyValue")}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.project_limit === null
                ? t("contractorPartners.unlimitedProjects")
                : t("contractorPartners.projectLimit", {
                    count: row.original.project_limit,
                  })}
            </p>
          </div>
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
              <p className="max-w-[220px] truncate text-xs text-muted-foreground">
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
          <TypeBadge label={String(row.original.user_count)} />
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
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary hover:bg-primary/10"
            title={t("common.view")}
          >
            <Link href={`/companies/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ),
      },
    ],
    [df, t],
  );

  const totalCount = data?.count ?? 0;
  const activeStatus = list.filters.status ?? "";

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("contractorPartners.title")}
        subtitle={
          isLoading
            ? t("common.loading")
            : t("contractorPartners.count", { count: totalCount })
        }
        action={
          <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
            <Link href="/companies/create?type=CONTRACTOR">
              <Plus className="h-4 w-4" />
              {t("contractorPartners.new")}
            </Link>
          </Button>
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
        storageKey="contractor-partners"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: activeStatus === "",
            onSelect: () => list.setFilter("status", undefined),
          },
          ...(["ACTIVE", "TRIAL", "SUSPENDED", "OVERDUE", "CLOSED"] as const).map(
            (status) => ({
              key: status,
              label: t(`companies.status.${status}`),
              active: activeStatus === status,
              onSelect: () => list.setFilter("status", status),
            }),
          ),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}
