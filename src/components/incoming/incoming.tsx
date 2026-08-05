"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Info, PackageCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DISPATCH_STATE_TONE } from "@/components/dispatches/dispatches";
import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useListQuery } from "@/hooks/use-list-query";
import type { WasteDispatch } from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import {
  collectDispatch,
  getIncoming,
} from "@/services/recycler.service";

/**
 * The yard's inbox.
 *
 * A separate screen from the dispatch list rather than a filter on it, because
 * they answer different questions. The list is every load this company can
 * see, which for a recycler includes ones long since weighed and settled. This
 * is what is coming through the gate today, and it is the screen a yard leaves
 * open.
 */
export function Incoming() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["state"]);

  const [collecting, setCollecting] = useState<WasteDispatch | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["incoming", list.query],
    queryFn: () => getIncoming(list.query),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["incoming"] });
    void queryClient.invalidateQueries({ queryKey: ["dispatches"] });
  }

  const columns = useMemo<ColumnDef<WasteDispatch, unknown>[]>(
    () => [
      {
        accessorKey: "dispatch_no",
        meta: { label: t("incoming.field.dispatchNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("incoming.field.dispatchNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.dispatch_no}
          </span>
        ),
      },
      {
        accessorKey: "state",
        meta: { label: t("incoming.field.state") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("incoming.field.state")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`dispatches.state.${row.original.state}`)}
            tone={DISPATCH_STATE_TONE[row.original.state]}
          />
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("incoming.field.project") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("incoming.field.project")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[200px] truncate">{row.original.project_name}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {row.original.project_code}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "waste_type",
        meta: { label: t("incoming.field.wasteType") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("incoming.field.wasteType")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge
            label={t(`dispatches.wasteType.${row.original.waste_type}`)}
          />
        ),
      },
      {
        accessorKey: "estimated_weight_kg",
        meta: { label: t("incoming.field.estimatedWeight") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("incoming.field.estimatedWeight")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.estimated_weight_kg ?? t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "vehicle_plate",
        meta: { label: t("incoming.field.vehiclePlate") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("incoming.field.vehiclePlate")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular truncate">{row.original.vehicle_plate}</p>
            {row.original.driver_name && (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.driver_name}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "released_at",
        meta: { label: t("incoming.field.releasedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("incoming.field.releasedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.released_at
              ? df.date(row.original.released_at)
              : t("common.emptyValue")}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) =>
          can("dispatch.update") && row.original.state === "RELEASED" ? (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-success hover:bg-success/10"
                title={t("incoming.collect.confirm")}
                onClick={() => setCollecting(row.original)}
              >
                <PackageCheck className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, df, can],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("incoming.title")}
        subtitle={isLoading ? "—" : t("incoming.count", { count: totalCount })}
      />

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("incoming.declaredNote")}
      </p>

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
        storageKey="incoming"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: (list.filters.state ?? "") === "",
            onSelect: () => list.setFilter("state", undefined),
          },
          ...(["RELEASED", "COLLECTED"] as const).map((state) => ({
            key: state,
            label: t(`dispatches.state.${state}`),
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

      {collecting && (
        <CollectDialog
          load={collecting}
          onClose={() => setCollecting(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

/**
 * Taking a load on.
 *
 * Its own dialog rather than the shared confirm because of the reference
 * field: a yard that runs its own numbering quotes that number to its driver,
 * and forcing ours on them would only mean two numbers on the paperwork.
 */
function CollectDialog({
  load,
  onClose,
  onDone,
}: {
  load: WasteDispatch;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [reference, setReference] = useState("");

  const collect = useMutation({
    mutationFn: () => collectDispatch(load.id, reference.trim()),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[480px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("incoming.collect.title")}</DialogTitle>
          <DialogDescription>
            {t("incoming.collect.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <p className="tabular text-sm font-medium text-foreground">
            {load.dispatch_no}
          </p>
          <p className="text-xs text-muted-foreground">
            {load.project_name} · {t(`dispatches.wasteType.${load.waste_type}`)}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            {t("incoming.collect.reference")}
          </Label>
          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("incoming.collect.referenceHint")}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            disabled={collect.isPending}
            onClick={() => collect.mutate()}
          >
            <PackageCheck className="h-4 w-4" />
            {t("incoming.collect.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
