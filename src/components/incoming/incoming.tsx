"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarClock,
  Eye,
  Info,
  Loader2,
  PackageCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";
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
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type { WasteDispatch } from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import {
  getIncomingOfflineAware,
  getIncomingSummaryOfflineAware,
} from "@/services/recycler-offline.service";
import {
  submitDispatchAcceptOfflineAware,
  submitDispatchCollectOfflineAware,
} from "@/services/offline-sync.service";
import { proposeWasteCollectionTime } from "@/services/waste-outgoing.service";

function localDateTimeInput(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** The recycler's complete order book; state pills narrow it to live work. */
export function Incoming() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery([
    "state",
    "collection_date_from",
    "collection_date_to",
  ]);
  const ownerId = user?.id ?? "";

  const [collecting, setCollecting] = useState<WasteDispatch | null>(null);
  const [assigning, setAssigning] = useState<WasteDispatch | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["incoming", list.query],
    queryFn: () => getIncomingOfflineAware(ownerId, list.query),
    enabled: Boolean(ownerId),
  });
  const summary = useQuery({
    queryKey: ["incoming", "summary"],
    queryFn: () => getIncomingSummaryOfflineAware(ownerId),
    enabled: Boolean(ownerId),
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
            <p className="max-w-[200px] truncate font-medium">{row.original.contractor_name}</p>
            <p className="max-w-[200px] truncate text-xs">{row.original.project_name}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {row.original.project_code}
            </p>
          </div>
        ),
      },
      {
        // Where the lorry goes. The order book carried every other fact about
        // a load and not this one, so a yard planning tomorrow's runs had to
        // ring the contractor to find out where to send the driver (F-302).
        accessorKey: "pickup_address",
        meta: { label: t("incoming.field.pickupAddress") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("incoming.field.pickupAddress")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-[220px] truncate"
              title={row.original.pickup_address}
            >
              {row.original.pickup_address || t("common.emptyValue")}
            </p>
            {/* Typed or inherited. After a load turns up at the wrong gate the
                two strings look identical, and only this line separates
                "somebody chose this" from "nobody did". */}
            <p className="truncate text-xs text-muted-foreground">
              {row.original.pickup_address_source === "MANUAL"
                ? t("incoming.field.pickupAddressTyped")
                : t("incoming.field.pickupAddressFromProject")}
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
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button asChild variant="ghost" size="icon" className="h-7 w-7" title={t("common.view")}>
              <Link href={`/dispatches/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {can("task.assign") &&
            ["PENDING_ACCEPTANCE", "ACCEPTED"].includes(row.original.state) ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10"
                title={t("incoming.order.action")}
                onClick={() => setAssigning(row.original)}
              >
                <Truck className="h-3.5 w-3.5" />
              </Button>
          ) : can("dispatch.update") && row.original.state === "RELEASED" ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-success hover:bg-success/10"
                title={t("incoming.collect.confirm")}
                onClick={() => setCollecting(row.original)}
              >
                <PackageCheck className="h-3.5 w-3.5" />
              </Button>
          ) : null}
          </div>
        ),
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

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {(["today_orders", "month_orders", "completed_orders", "recycling_orders", "cancelled_orders"] as const).map(
          (key) => (
            <div key={key} className="rounded-lg border bg-card px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{t(`incoming.summary.${key}`)}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {summary.data?.[key] ?? "—"}
              </p>
            </div>
          ),
        )}
      </div>

      <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:max-w-xl">
        <div className="space-y-1">
          <Label htmlFor="incoming-date-from" className="text-xs text-muted-foreground">
            {t("incoming.filter.collectionDateFrom")}
          </Label>
          <Input
            id="incoming-date-from"
            type="date"
            max={list.filters.collection_date_to}
            value={list.filters.collection_date_from ?? ""}
            onChange={(event) =>
              list.setFilter("collection_date_from", event.target.value || undefined)
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="incoming-date-to" className="text-xs text-muted-foreground">
            {t("incoming.filter.collectionDateTo")}
          </Label>
          <Input
            id="incoming-date-to"
            type="date"
            min={list.filters.collection_date_from}
            value={list.filters.collection_date_to ?? ""}
            onChange={(event) =>
              list.setFilter("collection_date_to", event.target.value || undefined)
            }
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
        storageKey="incoming"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active:
              (list.filters.state ?? "") === "" &&
              !list.filters.collection_date_from &&
              !list.filters.collection_date_to,
            onSelect: () => list.setFilter("state", undefined),
          },
          ...([
            "PENDING_ACCEPTANCE",
            "ACCEPTED",
            "RELEASED",
            "COLLECTED",
            "WEIGHED",
            "SETTLED",
            "CANCELLED",
          ] as const).map((state) => ({
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

      {assigning && (
        <OrderAssignmentDialog
          load={assigning}
          onClose={() => setAssigning(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function OrderAssignmentDialog({
  load,
  onClose,
  onDone,
}: {
  load: WasteDispatch;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [reference, setReference] = useState("");
  const [proposedAt, setProposedAt] = useState(
    localDateTimeInput(load.confirmed_collection_at ?? load.proposed_collection_at),
  );
  const [proposalNote, setProposalNote] = useState("");

  /*
   * Kept for the orders that are still waiting (T-226).
   *
   * Nothing new reaches `PENDING_ACCEPTANCE` - the site's order is accepted
   * the moment it is sent (D-111) - but rows raised before that change are
   * still in the yard's book, and leaving them with no button would strand
   * them. The offline queue replays through this same call.
   */
  const acceptOnly = useMutation({
    mutationFn: () =>
      submitDispatchAcceptOfflineAware(ownerId, {
        dispatchId: load.id,
        dispatchNo: load.dispatch_no,
        recyclerReference: reference.trim(),
        proposedCollectionAt: new Date(proposedAt).toISOString(),
        proposedCollectionNote: proposalNote.trim(),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  /*
   * What the yard does with an order it already has: say when it can collect.
   *
   * 客户：「建筑商发送订单的时候是自动接受的，不存在他们可以拒绝订单的情况。」
   * So there is no accept step any more; the scheduling remains, because the
   * yard owns the lorries and D-111 kept 「回收商之后可以改」. It is a proposal -
   * the site confirms it before a driver can be committed.
   */
  const propose = useMutation({
    mutationFn: () =>
      proposeWasteCollectionTime(load.id, {
        collectionAt: new Date(proposedAt).toISOString(),
        note: proposalNote.trim(),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const waitingForContractor =
    load.state === "ACCEPTED" && !load.confirmed_collection_at;
  const pending = acceptOnly.isPending || propose.isPending;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("incoming.order.title")}</DialogTitle>
          <DialogDescription>
            {t("incoming.order.description", { order: load.dispatch_no })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <p className="text-sm font-medium">{load.project_name}</p>
          <p className="text-xs text-muted-foreground">
            {t(`dispatches.wasteType.${load.waste_type}`)}
          </p>
          {/* Repeated here rather than left to the list column because this is
              the screen where the yard commits a driver to the run. */}
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("incoming.field.pickupAddress")}
          </p>
          <p className="text-sm">
            {load.pickup_address || t("common.emptyValue")}
          </p>
          <p className="text-xs text-muted-foreground">
            {load.pickup_address_source === "MANUAL"
              ? t("incoming.field.pickupAddressTyped")
              : t("incoming.field.pickupAddressFromProject")}
          </p>
        </div>

        {load.state === "PENDING_ACCEPTANCE" ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-info/25 bg-info/5 p-3 text-sm leading-6">
              {t("incoming.order.proposalHelp")}
            </div>
            <div className="space-y-1.5">
              <Label>{t("incoming.collect.reference")}</Label>
              <Input value={reference} onChange={(event) => setReference(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("incoming.order.proposedAt")}</Label>
              <Input type="datetime-local" min={localDateTimeInput()} value={proposedAt} onChange={(event) => setProposedAt(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("incoming.order.proposalNote")}</Label>
              <Textarea value={proposalNote} onChange={(event) => setProposalNote(event.target.value)} />
            </div>
          </div>
        ) : load.state === "ACCEPTED" ? (
          <div className="grid gap-4">
            {/* Said plainly, because the button that used to be here is gone
                and a screen that simply lost its action reads as broken. */}
            <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm leading-6">
              {t("incoming.order.autoAccepted")}
            </div>
            <div className="space-y-1.5">
              <Label>{t("incoming.order.wantedAt")}</Label>
              <p className="text-sm">
                {load.confirmed_collection_at
                  ? new Date(load.confirmed_collection_at).toLocaleString()
                  : load.proposed_collection_at
                    ? new Date(load.proposed_collection_at).toLocaleString()
                    : t("common.emptyValue")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("incoming.order.proposedAt")}</Label>
              <Input type="datetime-local" min={localDateTimeInput()} value={proposedAt} onChange={(event) => setProposedAt(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("incoming.order.proposalNote")}</Label>
              <Textarea value={proposalNote} onChange={(event) => setProposalNote(event.target.value)} />
            </div>
            {waitingForContractor && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm font-semibold">{t("incoming.order.waitingConfirmation")}</p>
              </div>
            )}
          </div>
        ) : (
        <div className="grid gap-4">
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <p className="text-sm font-semibold">{t("incoming.order.confirmedAt")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {load.confirmed_collection_at ? new Date(load.confirmed_collection_at).toLocaleString() : t("common.emptyValue")}
            </p>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("incoming.order.dispatchElsewhere")}
          </p>
        </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          {load.state === "PENDING_ACCEPTANCE" && (
            <Button requires={[[proposedAt, t("incoming.order.proposedAt")]]}
                    disabled={pending} onClick={() => acceptOnly.mutate()}>
              {acceptOnly.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
              {t("incoming.order.acceptAndPropose")}
            </Button>
          )}
          {load.state === "ACCEPTED" && (
            <Button requires={[[proposedAt, t("incoming.order.proposedAt")]]}
                    disabled={pending} onClick={() => propose.mutate()}>
              {propose.isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />}
              {t("incoming.order.proposeTime")}
            </Button>
          )}
          {load.state === "ACCEPTED" && !waitingForContractor && (
            <Button asChild variant="outline">
              <Link href="/tasks/create">
                <Truck />
                {t("incoming.order.goToDispatch")}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const { user } = useAuth();
  const [reference, setReference] = useState("");

  const collect = useMutation({
    mutationFn: () =>
      submitDispatchCollectOfflineAware(user?.id ?? "", {
        dispatchId: load.id,
        dispatchNo: load.dispatch_no,
        recyclerReference: reference.trim(),
      }),
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
