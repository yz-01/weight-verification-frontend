"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCheck, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/platform-ops.service";

export function Notifications() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const list = useListQuery(["unread", "kind"]);

  const query = useQuery({
    queryKey: ["notifications", list.query],
    queryFn: () => getNotifications(list.query),
    refetchInterval: 30_000,
  });

  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const columns = useMemo<ColumnDef<NotificationRow, unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        meta: { label: t("notifications.field.time") },
        header: ({ column }) => (
          <SortableHeader
            label={t("notifications.field.time")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {df.dateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "kind",
        meta: { label: t("notifications.field.kind") },
        header: () => t("notifications.field.kind"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`notifications.kind.${row.original.kind}`)}
            tone={row.original.kind === "EXCEPTION" ? "danger" : "neutral"}
          />
        ),
      },
      {
        accessorKey: "title",
        meta: { label: t("notifications.field.notification") },
        header: () => t("notifications.field.notification"),
        cell: ({ row }) => (
          <div className="max-w-xl">
            <p className={row.original.is_read ? "font-medium" : "font-semibold"}>
              {row.original.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {row.original.message}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        meta: { label: t("notifications.field.status") },
        header: () => t("notifications.field.status"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(
              row.original.is_read
                ? "notifications.status.read"
                : "notifications.status.unread",
            )}
            tone={row.original.is_read ? "neutral" : "info"}
          />
        ),
      },
      {
        id: "actions",
        meta: { label: t("common.actions") },
        header: () => null,
        cell: ({ row }) =>
          row.original.is_read ? null : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t("notifications.markRead")}
              disabled={read.isPending}
              onClick={() => read.mutate(row.original.id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          ),
      },
    ],
    [df, read, t],
  );

  const count = query.data?.count ?? 0;
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("notifications.title")}
        subtitle={
          query.isLoading
            ? t("common.loading")
            : t("notifications.count", { count })
        }
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={readAll.isPending || count === 0}
            onClick={() => readAll.mutate()}
          >
            <CheckCheck className="h-4 w-4" />
            {t("notifications.markAllRead")}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={query.data?.results ?? []}
        totalCount={count}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={query.isLoading}
        isError={query.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="notifications"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.unread,
            onSelect: () => list.setFilter("unread", undefined),
          },
          {
            key: "unread",
            label: t("notifications.status.unread"),
            active: list.filters.unread === "true",
            onSelect: () => list.setFilter("unread", "true"),
          },
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
