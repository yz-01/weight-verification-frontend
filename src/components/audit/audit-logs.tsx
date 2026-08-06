"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, FileDown, Loader2, UserCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AuditEntryDialog } from "@/components/audit/audit-entry-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListQuery } from "@/hooks/use-list-query";
import type { AuditAction, AuditLogEntry } from "@/interfaces/audit";
import { exportAuditLogs, getAuditLogs } from "@/services/audit.service";
import { getCompanies } from "@/services/companies.service";
import { useDateFormat } from "@/lib/dates";

const FILTER_KEYS = [
  "action",
  "company",
  "object_type",
  "module",
  "ip_address",
  "date_from",
  "date_to",
];

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

export function AuditLogs({
  fixedAction,
  fixedModule,
  fixedCategory,
  advanced = false,
  showExport = false,
  title,
  subtitle,
}: {
  fixedAction?: AuditAction;
  fixedModule?: string;
  fixedCategory?: string;
  advanced?: boolean;
  showExport?: boolean;
  title?: string;
  subtitle?: string;
} = {}) {
  const t = useTranslations();
  const df = useDateFormat();
  const { user } = useAuth();
  const list = useListQuery(FILTER_KEYS);
  const [viewing, setViewing] = useState<AuditLogEntry | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-logs", fixedAction, fixedModule, fixedCategory, list.query],
    queryFn: () => getAuditLogs({
      ...list.query,
      action: fixedAction ?? list.query.action,
      module: fixedModule,
      category: fixedCategory,
    }),
  });
  const companies = useQuery({
    queryKey: ["companies", "audit-options"],
    queryFn: () => getCompanies({ page_size: 100, sort_by: "name" }),
    enabled: Boolean(user?.is_platform_staff),
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
            {df.precise(row.original.created_at)}
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
    [t, df],
  );

  const filterPills = fixedAction ? undefined : [
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
  const exportMutation = useMutation({
    mutationFn: (format: "PDF" | "EXCEL") =>
      exportAuditLogs({
        ...list.query,
        action: fixedAction ?? list.query.action,
        module: fixedModule,
        category: fixedCategory,
        format,
        title: title ?? t("audit.title"),
        subtitle: subtitle ?? t("audit.exportSubtitle"),
        empty_label: t("audit.empty"),
        columns: [
          { key: "created_at", label: t("audit.field.createdAt") },
          { key: "action", label: t("audit.field.action") },
          { key: "actor_email", label: t("audit.field.actor") },
          { key: "company_name", label: t("audit.field.company") },
          { key: "object_type", label: t("audit.field.objectType") },
          { key: "object_id", label: t("audit.field.objectId") },
          { key: "object_repr", label: t("audit.field.objectRepr") },
          { key: "reason", label: t("audit.field.reason") },
          { key: "ip_address", label: t("audit.field.ipAddress") },
          { key: "request_path", label: t("audit.field.requestPath") },
        ],
      }),
  });

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={title ?? t("audit.title")}
        subtitle={subtitle ?? (isLoading ? "—" : t("audit.count", { count: totalCount }))}
        action={showExport ? (
          <div className="flex gap-2">
            <Button variant="outline" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate("PDF")}>
              {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <FileDown />}
              PDF
            </Button>
            <Button disabled={exportMutation.isPending} onClick={() => exportMutation.mutate("EXCEL")}>
              {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <FileDown />}
              Excel
            </Button>
          </div>
        ) : undefined}
      />

      {user?.is_platform_staff && (
        <select
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
          value={list.filters.company ?? ""}
          aria-label={t("audit.companyFilter")}
          onChange={(event) =>
            list.setFilter("company", event.target.value || undefined)
          }
        >
          <option value="">{t("audit.allCompanies")}</option>
          {(companies.data?.results ?? []).map((company) => (
            <option key={company.id} value={company.id}>
              {company.code} / {company.name}
            </option>
          ))}
        </select>
      )}

      {advanced && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <Input
            value={list.filters.object_type ?? ""}
            placeholder={t("audit.filter.objectType")}
            onChange={(event) => list.setFilter("object_type", event.target.value || undefined)}
          />
          <Input
            value={list.filters.module ?? ""}
            placeholder={t("audit.filter.module")}
            onChange={(event) => list.setFilter("module", event.target.value || undefined)}
          />
          <Input
            value={list.filters.ip_address ?? ""}
            placeholder={t("audit.filter.ipAddress")}
            onChange={(event) => list.setFilter("ip_address", event.target.value || undefined)}
          />
          <Input
            type="date"
            aria-label={t("audit.filter.dateFrom")}
            value={list.filters.date_from ?? ""}
            onChange={(event) => list.setFilter("date_from", event.target.value || undefined)}
          />
          <Input
            type="date"
            aria-label={t("audit.filter.dateTo")}
            value={list.filters.date_to ?? ""}
            onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
          />
        </div>
      )}

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
        storageKey={
          fixedAction
            ? `audit-logs-${fixedAction}`
            : fixedModule
              ? `audit-logs-${fixedModule}`
              : fixedCategory
                ? `audit-logs-${fixedCategory}`
              : "audit-logs"
        }
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
