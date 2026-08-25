"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Boxes,
  CheckCircle2,
  Loader2,
  PackagePlus,
  Plus,
  Scale,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  InventoryAdjustmentPayload,
  InventoryMovement,
  RecyclerBusinessSource,
  RecyclerMaterialType,
} from "@/interfaces/recycler-business";
import { RECYCLER_MATERIAL_TYPES } from "@/interfaces/recycler-business";
import { useDateFormat } from "@/lib/dates";
import {
  adjustInventory,
  getInventory,
  getInventoryMovements,
} from "@/services/recycler-business.service";

export function RecyclerInventoryWorkspace() {
  const t = useTranslations("recyclerBusiness");
  const { can } = useAuth();
  const [adjusting, setAdjusting] = useState(false);
  const inventory = useQuery({
    queryKey: ["recycler-inventory"],
    queryFn: () => getInventory(),
  });

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col gap-4">
      <ListHeader
        title={t("inventory.title")}
        subtitle={t("inventory.subtitle")}
        action={
          can("inventory.manage") ? (
            <Button size="sm" onClick={() => setAdjusting(true)}>
              <Plus />
              {t("action.adjustInventory")}
            </Button>
          ) : undefined
        }
      />

      <div className="grid shrink-0 gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={PackagePlus}
          label={t("inventory.platform")}
          value={inventory.data?.totals.PLATFORM ?? "0.000"}
          tone="text-info"
        />
        <SummaryTile
          icon={Boxes}
          label={t("inventory.private")}
          value={inventory.data?.totals.PRIVATE ?? "0.000"}
          tone="text-warning"
        />
        <SummaryTile
          icon={Scale}
          label={t("inventory.total")}
          value={inventory.data?.totals.TOTAL ?? "0.000"}
          tone="text-success"
        />
      </div>

      <Tabs defaultValue="balances" className="min-h-0 flex-1">
        <TabsList className="h-11 w-full justify-start p-1 sm:w-fit">
          <TabsTrigger value="balances" className="px-5 py-2">
            {t("inventory.balances")}
          </TabsTrigger>
          <TabsTrigger value="movements" className="px-5 py-2">
            {t("inventory.movements")}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="balances"
          className="min-h-0 flex-none overflow-auto rounded-lg border bg-card shadow-sm"
        >
          <Table className="min-w-[720px] table-fixed">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>{t("field.material")}</TableHead>
                <TableHead>{t("field.source")}</TableHead>
                <TableHead className="text-right">{t("field.currentWeight")}</TableHead>
                <TableHead>{t("field.lastMovement")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-36 p-0 text-center">
                    <div className="sticky left-0 grid w-[100cqw] place-items-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : inventory.data?.results.length ? (
                inventory.data.results.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{t(`material.${account.material_type}`)}</TableCell>
                    <TableCell><TypeBadge label={t(`source.${account.business_source}`)} /></TableCell>
                    <TableCell className="text-right text-base font-semibold tabular-nums">{account.current_weight_kg} kg</TableCell>
                    <TableCell className="text-muted-foreground">{account.last_movement_at ? new Date(account.last_movement_at).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-36 p-0 text-center">
                    <div className="sticky left-0 flex w-[100cqw] flex-col items-center gap-2 px-6 text-muted-foreground">
                      <div className="grid size-10 place-items-center rounded-md bg-muted">
                        <Boxes className="size-5" />
                      </div>
                      <p className="max-w-md whitespace-normal leading-6">
                        {t("inventory.empty")}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="movements" className="min-h-0">
          <MovementsPanel />
        </TabsContent>
      </Tabs>
      {adjusting && <AdjustmentDialog onClose={() => setAdjusting(false)} />}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className={`grid size-10 shrink-0 place-items-center rounded-md bg-muted ${tone}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value} kg</p>
      </div>
    </div>
  );
}

function MovementsPanel() {
  const t = useTranslations("recyclerBusiness");
  const df = useDateFormat();
  const list = useListQuery(["business_source", "material_type"]);
  const movements = useQuery({
    queryKey: ["recycler-inventory-movements", list.query],
    queryFn: () => getInventoryMovements(list.query),
  });

  const columns = useMemo<ColumnDef<InventoryMovement, unknown>[]>(
    () => [
      {
        accessorKey: "movement_no",
        meta: { label: t("field.movementNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.movementNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.movement_no}</span>,
      },
      {
        accessorKey: "material_type",
        meta: { label: t("field.material") },
        header: () => t("field.material"),
        cell: ({ row }) => t(`material.${row.original.material_type}`),
      },
      {
        accessorKey: "business_source",
        meta: { label: t("field.source") },
        header: () => t("field.source"),
        cell: ({ row }) => <TypeBadge label={t(`source.${row.original.business_source}`)} />,
      },
      {
        accessorKey: "kind",
        meta: { label: t("field.type") },
        header: () => t("field.type"),
        cell: ({ row }) => t(`movementKind.${row.original.kind}`),
      },
      {
        accessorKey: "quantity_kg",
        meta: { label: t("field.change") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.change")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className={row.original.quantity_kg.startsWith("-") ? "font-semibold text-destructive tabular-nums" : "font-semibold text-success tabular-nums"}>
            {row.original.quantity_kg.startsWith("-") ? "" : "+"}{row.original.quantity_kg} kg
          </span>
        ),
      },
      {
        accessorKey: "balance_after_kg",
        meta: { label: t("field.balance") },
        header: () => t("field.balance"),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.balance_after_kg} kg</span>,
      },
      {
        accessorKey: "occurred_at",
        meta: { label: t("field.occurredAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.occurredAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{df.dateTime(row.original.occurred_at)}</span>,
      },
    ],
    [df, t],
  );

  return (
    <DataTable
      columns={columns}
      rows={movements.data?.results ?? []}
      totalCount={movements.data?.count ?? 0}
      page={list.page}
      pageSize={list.pageSize}
      isLoading={movements.isLoading}
      isError={movements.isError}
      hasFilters={list.hasFilters}
      search={list.search}
      sortBy={list.sortBy}
      sortOrder={list.sortOrder}
      storageKey="recycler-inventory-movements"
      filterPills={[
        { key: "all", label: t("filter.all"), active: !list.filters.business_source, onSelect: () => list.setFilter("business_source", undefined) },
        { key: "platform", label: t("source.PLATFORM"), active: list.filters.business_source === "PLATFORM", onSelect: () => list.setFilter("business_source", "PLATFORM") },
        { key: "private", label: t("source.PRIVATE"), active: list.filters.business_source === "PRIVATE", onSelect: () => list.setFilter("business_source", "PRIVATE") },
      ]}
      onSearchChange={list.setSearch}
      onSortChange={list.setSort}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      onClearFilters={list.clearFilters}
    />
  );
}

function AdjustmentDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<InventoryAdjustmentPayload>({
    material_type: "METAL",
    business_source: "PLATFORM",
    quantity_kg: "",
    reason: "",
  });
  const save = useMutation({
    mutationFn: () => adjustInventory(form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recycler-inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["recycler-inventory-movements"] });
      onClose();
    },
  });
  const valid = Number(form.quantity_kg) !== 0 && Number.isFinite(Number(form.quantity_kg)) && form.reason.trim();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("inventory.adjustTitle")}</DialogTitle>
          <DialogDescription>{t("inventory.adjustHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.material")} required>
            <Select value={form.material_type} onValueChange={(value) => setForm({ ...form, material_type: value as RecyclerMaterialType })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{RECYCLER_MATERIAL_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`material.${value}`)}</SelectItem>)}</SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.source")} required>
            <Select value={form.business_source} onValueChange={(value) => setForm({ ...form, business_source: value as RecyclerBusinessSource })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="PLATFORM">{t("source.PLATFORM")}</SelectItem><SelectItem value="PRIVATE">{t("source.PRIVATE")}</SelectItem></SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.adjustmentWeight")} required hint={t("inventory.adjustmentHint")}>
            <Input type="number" step="0.001" value={form.quantity_kg} onChange={(event) => setForm({ ...form, quantity_kg: event.target.value })} />
          </FieldWrapper>
          <FieldWrapper label={t("field.reason")} required className="sm:col-span-2">
            <Textarea rows={4} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X />{common("cancel")}</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {t("action.recordAdjustment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
