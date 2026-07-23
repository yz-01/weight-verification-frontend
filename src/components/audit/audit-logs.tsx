"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Eye, UserCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AuditEntryDialog } from "@/components/audit/audit-entry-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { AuditAction, AuditLogEntry } from "@/interfaces/audit";
import { getAuditLogs } from "@/services/audit.service";

const FILTER_KEYS = ["action"];

/**
 * How each action reads.
 *
 * Removals and failed sign-ins are the ones an investigator scans for, so they
 * carry the alarming tones. Permission and billing changes are amber because
 * they are legitimate but always worth a second look.
 */
const ACTION_TONE: Record<
  AuditAction,
  "positive" | "info" | "warning" | "danger" | "neutral"
> = {
  CREATE: "positive",
  UPDATE: "info",
  DELETE: "danger",
  RESTORE: "positive",
  LOGIN: "neutral",
  LOGOUT: "neutral",
  LOGIN_FAILED: "danger",
  PASSWORD_CHANGE: "warning",
  PERMISSION_CHANGE: "warning",
  BILLING_CHANGE: "warning",
  EXPORT: "info",
  IMPERSONATE: "warning",
  MAINTENANCE: "warning",
  LOCK: "info",
};

const FILTERABLE_ACTIONS: AuditAction[] = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "PERMISSION_CHANGE",
  "LOGIN_FAILED",
];

export function AuditLogs() {
  const t = useTranslations();
  const list = useListQuery(FILTER_KEYS);
  const [viewing, setViewing] = useState<AuditLogEntry | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-logs", list.query],
    queryFn: () => getAuditLogs(list.query),
  });

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        meta: { label: t("audit.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("audit.field.createdAt")}
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
        accessorKey: "action",
        meta: { label: t("audit.field.action") },
        header: ({ column }) => (
          <SortableHeader
            label={t("audit.field.action")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`audit.action.${row.original.action}`)}
            tone={ACTION_TONE[row.original.action]}
          />
        ),
      },
      {
        accessorKey: "actor_email",
        meta: { label: t("audit.field.actor") },
        header: ({ column }) => (
          <SortableHeader
            label={t("audit.field.actor")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[200px] truncate">
              {row.original.actor_name ??
                row.original.actor_email ??
                t("common.emptyValue")}
            </p>
            {/* Platform staff acting through a tenant account must never look
                like the tenant did it themselves. */}
            {row.original.impersonated_by_name && (
              <p className="flex items-center gap-1 text-xs text-warning">
                <UserCog className="h-3 w-3" />
                {t("audit.impersonatedBy", {
                  name: row.original.impersonated_by_name,
                })}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "object_repr",
        meta: { label: t("audit.field.objectRepr") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("audit.field.objectRepr")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-[240px] truncate"
              title={row.original.object_repr}
            >
              {row.original.object_repr || t("common.emptyValue")}
            </p>
            {row.original.object_type && (
              <p className="text-xs text-muted-foreground">
                {row.original.object_type}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "reason",
        meta: { label: t("audit.field.reason") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("audit.field.reason")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[200px] truncate text-muted-foreground"
            title={row.original.reason}
          >
            {row.original.reason || t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "ip_address",
        meta: { label: t("audit.field.ipAddress") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("audit.field.ipAddress")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.ip_address ?? t("common.emptyValue")}
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
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("common.view")}
              onClick={() => setViewing(row.original)}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  const filterPills = [
    {
      key: "all",
      label: t("common.all"),
      active: !list.filters.action,
      onSelect: () => list.setFilter("action", undefined),
    },
    ...FILTERABLE_ACTIONS.map((action) => ({
      key: action,
      label: t(`audit.action.${action}`),
      active: list.filters.action === action,
      onSelect: () => list.setFilter("action", action),
    })),
  ];

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("audit.title")}
        subtitle={isLoading ? "—" : t("audit.count", { count: totalCount })}
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
        storageKey="audit-logs"
        filterPills={filterPills}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {viewing && (
        <AuditEntryDialog entry={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
