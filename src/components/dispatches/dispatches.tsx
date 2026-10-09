"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DrillNote } from "@/components/shared/drill-note";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { RecordNo } from "@/components/shared/record-no";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import { useDateFormat } from "@/lib/dates";
import {
  DISPATCH_STATES,
  WASTE_TYPES,
  type DispatchState,
  type WasteDispatch,
} from "@/interfaces/contractor";
import {
  getDispatches,
  exportDispatches,
  type ExportFormat,
} from "@/services/contractor.service";

export const DISPATCH_STATE_TONE: Record<
  DispatchState,
  "neutral" | "info" | "warning" | "positive" | "danger"
> = {
  DRAFT: "neutral",
  PENDING_ACCEPTANCE: "warning",
  ACCEPTED: "info",
  RELEASED: "info",
  COLLECTED: "warning",
  WEIGHED: "info",
  SETTLED: "positive",
  CANCELLED: "danger",
};

/** The states a 废料订单 passes through, in order, for the filter pills. */
const TRACKED_STATES = [
  "ACCEPTED",
  "COLLECTED",
  "WEIGHED",
  "SETTLED",
  "CANCELLED",
] as const;

/**
 * Where an order's application opens: the 环保材料出场申请 list with that
 * record shown, as its notifications link to it.
 */
export function applicationHref(row: Pick<WasteDispatch, "source_record_id" | "project">) {
  return `/waste-outgoing?record=${row.source_record_id}&project=${row.project}`;
}

/** {@link DispatchCategory} as one line of text, for a merged list. */
export function dispatchCategoryText(
  row: Pick<WasteDispatch, "source_category_name" | "waste_type" | "is_legacy">,
  t: (key: string) => string,
): string {
  if (row.source_category_name) return row.source_category_name;
  const type = t(`dispatches.wasteType.${row.waste_type}`);
  return row.is_legacy ? `${type} · ${t("dispatches.tracker.legacy")}` : type;
}

/**
 * An order's category, as the application list names it (2026-10-09).
 *
 * An order raised from an application carries that application's category -
 * a system preset already in the reader's language from the server. An old
 * order made directly, before the application flow, has none: it falls back
 * to the closed waste type it was raised with, and says it is old.
 */
export function DispatchCategory({ row }: { row: WasteDispatch }) {
  const t = useTranslations();
  if (row.source_category_name) {
    return <span className="block max-w-45 truncate">{row.source_category_name}</span>;
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate">{t(`dispatches.wasteType.${row.waste_type}`)}</span>
      {row.is_legacy && <TypeBadge label={t("dispatches.tracker.legacy")} />}
    </span>
  );
}

/**
 * The contractor's 废料订单: a read-only tracker of the orders the recycler
 * received (Lucas 2026-10-09).
 *
 * An order is what an approved 环保材料出场申请 becomes when the office
 * arranges the recycler, so nothing is raised here any more - the direct
 * 新增废料订单 form, with its own nine fixed waste types and no approval, was
 * retired. Each row lines up with the application it came from: its number
 * (opening it) and status, and its category under the same name the
 * application list uses. Old orders made directly before the application flow
 * stay, marked 「旧订单」, for history.
 *
 * The recycler's own order book (废料订单 in their console) is a different
 * screen and is not touched.
 */
export function Dispatches() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  // `counted=1` arrives from the head office's 废料订单 card (F8): only the
  // orders it counts - not a draft, not cancelled.
  const list = useListQuery(["state", "project", "waste_type", "counted"]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dispatches", list.query],
    queryFn: () => getDispatches(list.query),
  });

  const columns = useMemo<ColumnDef<WasteDispatch, unknown>[]>(
    () => [
      {
        accessorKey: "dispatch_no",
        meta: { label: t("dispatches.tracker.orderNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("dispatches.tracker.orderNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        // Q12: the short number big, the project code small; the whole
        // number on hover, in the detail and in the export.
        cell: ({ row }) => (
          <RecordNo value={row.original.dispatch_no} projectCode={row.original.project_code} />
        ),
      },
      {
        id: "application",
        meta: { label: t("dispatches.tracker.applicationNo") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("dispatches.tracker.applicationNo")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.source_record_id ? (
            <div className="min-w-0">
              <Link
                href={applicationHref(row.original)}
                className="inline-block text-primary hover:underline"
                aria-label={t("dispatches.tracker.openApplication", {
                  number: row.original.source_reference_no ?? "",
                })}
              >
                <RecordNo
                  value={row.original.source_reference_no}
                  projectCode={row.original.project_code}
                  copyable={false}
                />
              </Link>
              {row.original.source_status && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t(`wasteOutgoing.status.${row.original.source_status}`)}
                </p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{t("common.emptyValue")}</span>
          ),
      },
      {
        id: "category",
        meta: { label: t("dispatches.tracker.category") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("dispatches.tracker.category")}
          </span>
        ),
        cell: ({ row }) => <DispatchCategory row={row.original} />,
      },
      {
        accessorKey: "state",
        meta: { label: t("dispatches.field.state") },
        header: ({ column }) => (
          <SortableHeader
            label={t("dispatches.field.state")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`dispatches.state.${row.original.state}`)}
            tone={DISPATCH_STATE_TONE[row.original.state]}
          />
        ),
      },
      {
        accessorKey: "recycler_name",
        meta: { label: t("dispatches.field.recycler") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("dispatches.field.recycler")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-45 truncate"
            title={row.original.recycler_name}
          >
            {row.original.recycler_name}
          </span>
        ),
      },
      {
        accessorKey: "vehicle_plate",
        meta: { label: t("dispatches.field.vehiclePlate") },
        header: () => (
          <span className="text-xs font-semibold text-muted-foreground">
            {t("dispatches.field.vehiclePlate")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular truncate">
              {row.original.vehicle_plate || t("common.emptyValue")}
            </p>
            {row.original.driver_name && (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.driver_name}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("dispatches.tracker.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("dispatches.tracker.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.created_at
              ? df.date(row.original.created_at)
              : t("common.emptyValue")}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        // Read-only (2026-10-09): the order opens; nothing is edited or
        // removed from the list.
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("common.view")}
            >
              <Link href={`/dispatches/${row.original.id}`}>
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
  const activeState = list.filters.state ?? "";

  /** The wording travels with the request; the backend holds no catalogue. */
  function runExport(format: ExportFormat) {
    return exportDispatches({
      format,
      title: t("dispatches.title"),
      subtitle: t("dispatches.count", { count: totalCount }),
      emptyLabel: t("table.noResults"),
      query: list.query,
      columns: [
        // The whole numbers here: an export is read away from the screen.
        { key: "dispatch_no", label: t("dispatches.tracker.orderNo") },
        { key: "source_reference_no", label: t("dispatches.tracker.applicationNo") },
        { key: "source_category_name", label: t("dispatches.tracker.category") },
        {
          key: "state",
          label: t("dispatches.field.state"),
          values: Object.fromEntries(
            DISPATCH_STATES.map((state) => [
              state,
              t(`dispatches.state.${state}`),
            ]),
          ),
        },
        { key: "released_at", label: t("dispatches.field.releasedAt") },
        { key: "project_code", label: t("dispatches.field.project") },
        { key: "recycler_name", label: t("dispatches.field.recycler") },
        {
          key: "waste_type",
          label: t("dispatches.field.wasteType"),
          values: Object.fromEntries(
            WASTE_TYPES.map((type) => [type, t(`dispatches.wasteType.${type}`)]),
          ),
        },
        {
          key: "estimated_weight_kg",
          label: t("dispatches.field.estimatedWeight"),
        },
        { key: "vehicle_plate", label: t("dispatches.field.vehiclePlate") },
        { key: "driver_name", label: t("dispatches.field.driverName") },
        { key: "released_by_name", label: t("dispatches.field.releasedBy") },
      ],
    });
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <div className="space-y-2">
        <ListHeader
          title={t("dispatches.title")}
          subtitle={isLoading ? "—" : t("dispatches.count", { count: totalCount })}
        />
        {/* Where orders come from, and why an old one has no application. */}
        <p
          data-tracker-note
          className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("dispatches.tracker.note")}
        </p>
      </div>
      {list.filters.counted === "1" && (
        <DrillNote
          label={t("dispatches.countedOnly")}
          clearLabel={t("dispatches.showAll")}
          params={["counted"]}
        />
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
        storageKey="dispatches"
        toolbarActions={
          can("report.export") ? (
            <ExportButton onExport={runExport} disabled={totalCount === 0} />
          ) : undefined
        }
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: activeState === "",
            onSelect: () => list.setFilter("state", undefined),
          },
          ...TRACKED_STATES.map((state) => ({
            key: state,
            label: t(`dispatches.state.${state}`),
            active: activeState === state,
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
