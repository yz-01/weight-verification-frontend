"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, PauseCircle, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListQuery } from "@/hooks/use-list-query";
import type { Project, ProjectStatus } from "@/interfaces/contractor";
import { MALAYSIA_STATES } from "@/lib/malaysia";
import {
  exportProjects,
  getProjects,
  suspendProject,
  type ExportFormat,
} from "@/services/contractor.service";
import { useDateFormat } from "@/lib/dates";

export const PROJECT_STATUS_TONE: Record<
  ProjectStatus,
  "positive" | "info" | "warning" | "neutral"
> = {
  ACTIVE: "positive",
  PLANNING: "info",
  SUSPENDED: "warning",
  COMPLETED: "neutral",
  ARCHIVED: "neutral",
};

export function Projects() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery([
    "status",
    "state",
    "date_from",
    "date_to",
    "responsible",
  ]);
  const [removing, setRemoving] = useState<Project | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects", list.query],
    queryFn: () => getProjects(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => suspendProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<Project, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("projects.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("projects.field.code")}
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
        meta: { label: t("projects.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("projects.field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-[240px] truncate font-medium text-foreground"
              title={row.original.name}
            >
              {row.original.name}
            </p>
            {row.original.client_name && (
              <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                {row.original.client_name}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("projects.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("projects.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`projects.status.${row.original.status}`)}
            tone={PROJECT_STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "city",
        meta: { label: t("projects.field.city") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("projects.field.city")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.city || t("common.emptyValue")}
            </p>
            {row.original.state && (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.state}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "assigned_user_count",
        meta: { label: t("projects.field.assignedUsers") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("projects.field.assignedUsers")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.assigned_user_count ?? 0)} />
        ),
      },
      {
        accessorKey: "start_date",
        meta: { label: t("projects.field.startDate") },
        header: ({ column }) => (
          <SortableHeader
            label={t("projects.field.startDate")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.start_date
              ? df.date(row.original.start_date)
              : t("common.emptyValue")}
          </span>
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
              <Link href={`/projects/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {can("project.update") && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={t("common.edit")}
              >
                <Link href={`/projects/${row.original.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            {can("project.delete") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-warning hover:bg-warning/10"
                title={t("projects.remove.action")}
                onClick={() => setRemoving(row.original)}
              >
                <PauseCircle className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, can, df],
  );

  const totalCount = data?.count ?? 0;
  const activeStatus = list.filters.status ?? "";
  const runExport = (format: ExportFormat) =>
    exportProjects({
      format,
      title: t("projects.title"),
      emptyLabel: t("common.emptyValue"),
      query: list.query,
      columns: [
        { key: "code", label: t("projects.field.code") },
        { key: "name", label: t("projects.field.name") },
        { key: "status", label: t("projects.field.status") },
        { key: "client_name", label: t("projects.field.clientName") },
        { key: "main_contractor", label: t("projects.field.mainContractor") },
        { key: "consultant", label: t("projects.field.consultant") },
        { key: "city", label: t("projects.field.city") },
        { key: "state", label: t("projects.field.state") },
        { key: "start_date", label: t("projects.field.startDate") },
        { key: "end_date", label: t("projects.field.endDate") },
        { key: "site_manager", label: t("projects.field.siteManager") },
      ],
    });

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("projects.title")}
        subtitle={isLoading ? "—" : t("projects.count", { count: totalCount })}
        action={
          <>
            <ExportButton onExport={runExport} disabled={totalCount === 0} />
            {can("project.create") && (
              <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
                <Link href="/projects/create">
                  <Plus className="h-4 w-4" />
                  {t("projects.new")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 border-y bg-card/50 py-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("projects.filter.state")}</Label>
          <Select
            value={list.filters.state || "all"}
            onValueChange={(value) => list.setFilter("state", value === "all" ? undefined : value)}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {MALAYSIA_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("projects.filter.dateFrom")}</Label>
          <Input type="date" value={list.filters.date_from ?? ""} onChange={(event) => list.setFilter("date_from", event.target.value || undefined)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("projects.filter.dateTo")}</Label>
          <Input type="date" value={list.filters.date_to ?? ""} onChange={(event) => list.setFilter("date_to", event.target.value || undefined)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("projects.filter.responsible")}</Label>
          <Input
            value={list.filters.responsible ?? ""}
            placeholder={t("projects.filter.responsiblePlaceholder")}
            onChange={(event) => list.setFilter("responsible", event.target.value || undefined)}
          />
        </div>
      </div>

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
        storageKey="projects"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: activeStatus === "",
            onSelect: () => list.setFilter("status", undefined),
          },
          ...(["ACTIVE", "PLANNING", "SUSPENDED", "COMPLETED", "ARCHIVED"] as const).map(
            (status) => ({
              key: status,
              label: t(`projects.status.${status}`),
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

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={t("projects.remove.title", { name: removing.name })}
          description={t("projects.remove.description")}
          confirmLabel={t("projects.remove.confirm")}
          confirmIcon={PauseCircle}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}
