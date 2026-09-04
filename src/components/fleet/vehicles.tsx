"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Info, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import type { Vehicle, VehicleWorkStatus } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import {
  deleteVehicle,
  getVehicles,
  setVehicleTare,
} from "@/services/recycler.service";

const WORK_STATUSES: VehicleWorkStatus[] = [
  "AVAILABLE",
  "ON_TASK",
  "MAINTENANCE",
  "INACTIVE",
];

export function Vehicles() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["work_status"]);

  const [removing, setRemoving] = useState<Vehicle | null>(null);
  const [taring, setTaring] = useState<Vehicle | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["vehicles", list.query],
    queryFn: () => getVehicles(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<Vehicle, unknown>[]>(
    () => [
      {
        accessorKey: "plate_no",
        meta: { label: t("vehicles.field.plateNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("vehicles.field.plateNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.plate_no}
          </span>
        ),
      },
      {
        accessorKey: "vehicle_type",
        meta: { label: t("vehicles.field.vehicleType") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("vehicles.field.vehicleType")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`vehicles.type.${row.original.vehicle_type}`)} />
        ),
      },
      {
        accessorKey: "tare_weight_kg",
        meta: { label: t("vehicles.field.tareWeight") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("vehicles.field.tareWeight")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.has_stored_tare ? (
            <div className="min-w-0">
              <p className="tabular font-medium text-foreground">
                {row.original.tare_weight_kg}
              </p>
              <p className="tabular text-xs text-muted-foreground">
                {df.date(row.original.tare_measured_at)}
              </p>
            </div>
          ) : (
            <span className="text-xs italic text-muted-foreground">
              {t("vehicles.noTare")}
            </span>
          ),
      },
      {
        accessorKey: "brand",
        meta: { label: t("vehicles.field.brandModel") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("vehicles.field.brandModel")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="block max-w-[200px] truncate">
            {[row.original.brand, row.original.model].filter(Boolean).join(" ") ||
              row.original.make_model ||
              t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "work_status",
        meta: { label: t("vehicles.field.workStatus") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("vehicles.field.workStatus")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`vehicles.status.${row.original.work_status}`)}
            tone={vehicleStatusTone(row.original.work_status)}
          />
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
              <Link href={`/vehicles/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {can("fleet.set_tare") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={t("vehicles.tare.action")}
                onClick={() => setTaring(row.original)}
              >
                <Scale className="h-3.5 w-3.5" />
              </Button>
            )}
            {can("fleet.manage") && (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/vehicles/${row.original.id}/edit`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={t("common.remove")}
                  onClick={() => setRemoving(row.original)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
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
        title={t("vehicles.title")}
        subtitle={isLoading ? "—" : t("vehicles.count", { count: totalCount })}
        action={
          can("fleet.manage") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/vehicles/create">
                <Plus className="h-4 w-4" />
                {t("vehicles.new")}
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
        storageKey="vehicles"
        filterPills={WORK_STATUSES.map((status) => ({
          key: status,
          label: t(`vehicles.status.${status}`),
          active: list.filters.work_status === status,
          onSelect: () =>
            list.setFilter(
              "work_status",
              list.filters.work_status === status ? undefined : status,
            ),
        }))}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {taring && (
        <TareDialog vehicle={taring} onClose={() => setTaring(null)} />
      )}

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={t("vehicles.remove.title", { name: removing.plate_no })}
          description={t("vehicles.remove.description")}
          confirmLabel={t("vehicles.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}

function vehicleStatusTone(status: VehicleWorkStatus) {
  if (status === "AVAILABLE") return "positive" as const;
  if (status === "ON_TASK") return "info" as const;
  if (status === "MAINTENANCE") return "warning" as const;
  return "neutral" as const;
}

/**
 * Recording a lorry's empty weight.
 *
 * Its own dialog, not a field on the edit form, and it says plainly what the
 * number does. On a yard weighing against a stored tare it is subtracted from
 * every load this lorry ever brings in — the easiest way to defraud the system
 * from the inside, and the operator should be looking at that sentence while
 * they type.
 */
function TareDialog({
  vehicle,
  onClose,
}: {
  vehicle: Vehicle;
  onClose: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState(vehicle.tare_weight_kg ?? "");
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () => setVehicleTare(vehicle.id, weight, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("vehicles.tare.title")}</DialogTitle>
          <DialogDescription>{vehicle.plate_no}</DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-md bg-warning/12 px-3 py-2 text-xs text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("vehicles.tare.description")}
        </p>

        {vehicle.tare_measured_at && (
          <p className="text-xs text-muted-foreground">
            {t("vehicles.tare.measuredAt")}:{" "}
            {df.dateTime(vehicle.tare_measured_at)}
          </p>
        )}

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            {t("vehicles.tare.weight")}
            <span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Input
            type="number"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            {t("common.reason")}
            <span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Textarea
            rows={2}
            value={reason}
            placeholder={t("common.reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
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
            requires={[[weight, t("vehicles.field.tareWeight")], [reason, t("common.reason")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Scale className="h-4 w-4" />
            {t("vehicles.tare.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
