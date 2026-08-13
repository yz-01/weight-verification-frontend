"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Eye, Flag, ScanLine } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { SessionVerdict, WeighSessionRow } from "@/interfaces/weighing";
import { getWeighSessions } from "@/services/weighing.service";
import { useDateFormat } from "@/lib/dates";

const FILTER_KEYS = ["verdict", "requires_review"];

const VERDICT_TONE: Record<SessionVerdict, "positive" | "danger" | "warning"> = {
  VALID: "positive",
  INVALID: "danger",
  PENDING: "warning",
};

export function WeighSessions() {
  const t = useTranslations();
  const df = useDateFormat();
  const formatter = useFormatter();
  const { can } = useAuth();
  const list = useListQuery(FILTER_KEYS);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["weigh-sessions", list.query],
    queryFn: () => getWeighSessions(list.query),
  });

  const columns = useMemo<ColumnDef<WeighSessionRow, unknown>[]>(
    () => [
      {
        accessorKey: "session_no",
        meta: { label: t("weighing.field.sessionNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("weighing.field.sessionNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="tabular font-medium text-foreground">
              {row.original.session_no}
            </span>
            {/* Attempts past the first are the point of requirement rule 8, so
                they are visible in the list rather than buried in the detail. */}
            {row.original.attempt_no > 1 && (
              <span className="tabular rounded-full bg-warning/12 px-1.5 py-0.5 text-[0.6875rem] font-medium text-warning ring-1 ring-inset ring-warning/25">
                #{row.original.attempt_no}
              </span>
            )}
            {row.original.requires_review && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-destructive ring-1 ring-inset ring-destructive/25"
                title={t("weighing.requiresReviewHint")}
              >
                <Flag className="h-2.5 w-2.5" />
                {t("weighing.requiresReview")}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "verdict",
        meta: { label: t("weighing.field.verdict") },
        header: ({ column }) => (
          <SortableHeader
            label={t("weighing.field.verdict")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`weighing.verdict.${row.original.verdict}`)}
            tone={VERDICT_TONE[row.original.verdict]}
          />
        ),
      },
      {
        accessorKey: "stable_weight_kg",
        meta: { label: t("weighing.field.stableWeight") },
        header: ({ column }) => (
          <SortableHeader
            label={t("weighing.field.stableWeight")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) =>
          row.original.stable_weight_kg ? (
            <span className="tabular font-medium">
              {formatter.number(Number(row.original.stable_weight_kg), {
                maximumFractionDigits: 0,
              })}{" "}
              kg
            </span>
          ) : (
            <span className="italic text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        accessorKey: "anomaly_count",
        meta: { label: t("weighing.field.anomalyCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("weighing.field.anomalyCount")}
          </span>
        ),
        cell: ({ row }) =>
          (row.original.anomaly_count ?? 0) > 0 ? (
            // Icon plus number, never colour alone.
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="tabular font-medium">
                {row.original.anomaly_count}
              </span>
            </span>
          ) : (
            <span className="tabular text-muted-foreground">0</span>
          ),
      },
      {
        accessorKey: "vehicle_plate",
        meta: { label: t("weighing.field.vehiclePlate") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("weighing.field.vehiclePlate")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.vehicle_plate || (
            <span className="italic text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        accessorKey: "direction",
        meta: { label: t("weighing.field.direction") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("weighing.field.direction")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`weighing.direction.${row.original.direction}`)} />
        ),
      },
      {
        accessorKey: "scale_name",
        meta: { label: t("weighing.field.scale") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("weighing.field.scale")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[180px] truncate">{row.original.scale_name}</p>
            <p className="max-w-[180px] truncate text-xs text-muted-foreground">
              {row.original.site_name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "dispatch_no",
        meta: { label: t("dispatches.field.dispatchNo") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("dispatches.field.dispatchNo")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[180px] truncate">
              {row.original.dispatch_no ?? t("weighing.noDispatch")}
            </p>
            {row.original.project_name && (
              <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                {row.original.project_code} - {row.original.project_name}
              </p>
            )}
          </div>
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
          <span className="block max-w-[180px] truncate">
            {row.original.recycler_name ?? t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "started_at",
        meta: { label: t("weighing.field.startedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("weighing.field.startedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) =>
          row.original.started_at ? (
            <span className="tabular whitespace-nowrap text-muted-foreground">
              {df.dateTime(row.original.started_at)}
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
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("common.view")}
            >
              <Link href={`/weighing/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, df, formatter],
  );

  const filterPills = [
    {
      key: "all",
      label: t("weighing.filter.all"),
      active: !list.filters.verdict && !list.filters.requires_review,
      onSelect: () =>
        list.setFilters({ verdict: undefined, requires_review: undefined }),
    },
    {
      key: "valid",
      label: t("weighing.filter.valid"),
      active:
        list.filters.verdict === "VALID" && !list.filters.requires_review,
      onSelect: () =>
        list.setFilters({ verdict: "VALID", requires_review: undefined }),
    },
    {
      key: "invalid",
      label: t("weighing.filter.invalid"),
      active:
        list.filters.verdict === "INVALID" && !list.filters.requires_review,
      onSelect: () =>
        list.setFilters({ verdict: "INVALID", requires_review: undefined }),
    },
    {
      key: "review",
      label: t("weighing.filter.review"),
      active:
        list.filters.requires_review === "1" && !list.filters.verdict,
      onSelect: () =>
        list.setFilters({ verdict: undefined, requires_review: "1" }),
    },
  ];

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("weighing.title")}
        subtitle={isLoading ? "—" : t("weighing.count", { count: totalCount })}
        action={
          can("weighing.operate") ? (
            <Button asChild size="sm" className="rounded-full px-4">
              <Link href="/gate">
                <ScanLine className="h-3.5 w-3.5" />
                {t("gate.title")}
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
        storageKey="weigh-sessions"
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
