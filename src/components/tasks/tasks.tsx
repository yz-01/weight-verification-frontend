"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
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
import type { DriverTask, TaskState } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { getTasks } from "@/services/recycler.service";

export const TASK_STATE_TONE: Record<
  TaskState,
  "neutral" | "info" | "warning" | "positive" | "danger"
> = {
  ASSIGNED: "neutral",
  ACCEPTED: "info",
  EN_ROUTE: "info",
  ARRIVED: "warning",
  LOADED: "warning",
  RETURNING: "info",
  DELIVERED: "positive",
  CANCELLED: "neutral",
  FAILED: "danger",
};

/** The dispatch board. Defaults to what is still moving. */
export function Tasks() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(["state", "running"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tasks", list.query],
    queryFn: () => getTasks(list.query),
  });

  const columns = useMemo<ColumnDef<DriverTask, unknown>[]>(
    () => [
      {
        accessorKey: "task_no",
        meta: { label: t("tasks.field.taskNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("tasks.field.taskNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.task_no}
          </span>
        ),
      },
      {
        accessorKey: "state",
        meta: { label: t("tasks.field.state") },
        header: ({ column }) => (
          <SortableHeader
            label={t("tasks.field.state")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`tasks.state.${row.original.state}`)}
            tone={TASK_STATE_TONE[row.original.state]}
          />
        ),
      },
      {
        accessorKey: "dispatch_no",
        meta: { label: t("tasks.field.dispatch") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("tasks.field.dispatch")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.dispatch_no ? (
            <div className="min-w-0">
              <p className="tabular truncate">{row.original.dispatch_no}</p>
              {row.original.waste_type && (
                <p className="truncate text-xs text-muted-foreground">
                  {t(`dispatches.wasteType.${row.original.waste_type}`)}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs italic text-muted-foreground">
              {t("tasks.noDispatch")}
            </span>
          ),
      },
      {
        accessorKey: "driver_name",
        meta: { label: t("tasks.field.driver") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("tasks.field.driver")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.driver_name}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {row.original.vehicle_plate}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "site_name",
        meta: { label: t("tasks.field.site") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("tasks.field.site")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="block max-w-[160px] truncate">
            {row.original.site_name}
          </span>
        ),
      },
      {
        accessorKey: "scheduled_for",
        meta: { label: t("tasks.field.scheduledFor") },
        header: ({ column }) => (
          <SortableHeader
            label={t("tasks.field.scheduledFor")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.scheduled_for
              ? df.dateTime(row.original.scheduled_for)
              : t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "photo_count",
        meta: { label: t("tasks.field.photoCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("tasks.field.photoCount")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.photo_count ?? 0)} />
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
              <Link href={`/tasks/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, df],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("tasks.title")}
        subtitle={isLoading ? "—" : t("tasks.count", { count: totalCount })}
        action={
          can("task.assign") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/tasks/create">
                <Plus className="h-4 w-4" />
                {t("tasks.new")}
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
        storageKey="tasks"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.running && !list.filters.state,
            onSelect: () => list.clearFilters(),
          },
          {
            key: "running",
            label: t("tasks.state.EN_ROUTE"),
            active: list.filters.running === "true",
            onSelect: () => list.setFilter("running", "true"),
          },
          ...(["DELIVERED", "FAILED"] as const).map((state) => ({
            key: state,
            label: t(`tasks.state.${state}`),
            active: list.filters.state === state,
            onSelect: () => list.setFilter("state", state),
          })),
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
