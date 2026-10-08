"use client";

/**
 * 制造厂商 (2026-10 D1, Q13): the company's list of the factories that make its
 * materials, kept beside the supplier list and by the same people.
 *
 * A material category names the ones its contract allows (分类管理 → 指定厂商);
 * a record made by another is flagged 「非指定厂商」. The phone adds a missing
 * one from its picker; here the office names them properly, adds the
 * country, and switches off one that is no longer used. Removing is only for
 * one no record names, and is armed by a switch first (spec rule 8).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
import { Switch } from "@/components/ui/switch";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type { Manufacturer } from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import {
  createManufacturer,
  deleteManufacturer,
  getManufacturers,
  updateManufacturer,
} from "@/services/material-setup.service";

export function Manufacturers() {
  const t = useTranslations("manufacturers");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery();
  const [editing, setEditing] = useState<Manufacturer | "new" | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["manufacturers", "page", list.query],
    queryFn: () => getManufacturers(list.query),
  });
  const total = data?.count ?? 0;

  const columns = useMemo<ColumnDef<Manufacturer, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { label: t("field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: "country",
        meta: { label: t("field.country") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.country")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => row.original.country || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "is_active",
        meta: { label: t("field.isActive") },
        header: () => t("field.isActive"),
        cell: ({ row }) =>
          row.original.is_active ? (
            <StatusBadge label={t("field.isActive")} tone="positive" />
          ) : (
            <StatusBadge label={t("switchedOff")} tone="neutral" />
          ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{df.date(row.original.created_at)}</span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{common("actions")}</span>,
        cell: ({ row }) =>
          can("supplier.update") ? (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={common("edit")}
                onClick={() => setEditing(row.original)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, common, df, can],
  );

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={t("description")}
        action={
          can("supplier.create") ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          ) : undefined
        }
      />
      <DataTable
        columns={columns}
        rows={data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={isLoading}
        isError={isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="manufacturers"
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
      {editing && (
        <ManufacturerDialog
          row={editing === "new" ? null : editing}
          canRemove={can("supplier.delete")}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ManufacturerDialog({
  row,
  canRemove,
  onClose,
}: {
  row: Manufacturer | null;
  canRemove: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("manufacturers");
  const common = useTranslations("common");
  const qc = useQueryClient();
  const [name, setName] = useState(row?.name ?? "");
  const [country, setCountry] = useState(row?.country ?? "");
  const [active, setActive] = useState(row?.is_active ?? true);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [error, setError] = useState("");
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["manufacturers"] });
    onClose();
  };
  // A refusal the screen can name in the reader's language: a name already
  // on the list (400), or one a record already uses (409).
  const fail = (reason: unknown, fallback: string) =>
    setError(
      reason instanceof ApiError
        ? reason.status === 400 || reason.status === 409
          ? fallback
          : reason.message
        : t("picker.failed"),
    );
  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), country: country.trim(), is_active: active };
      return row ? updateManufacturer(row.id, payload) : createManufacturer(payload);
    },
    onSuccess: done,
    onError: (reason) => fail(reason, t("duplicate")),
  });
  const removal = useMutation({
    mutationFn: () => deleteManufacturer(row!.id),
    onSuccess: done,
    onError: (reason) => fail(reason, t("inUse")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("field.name")} required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.country")}>
            <Input value={country} onChange={(event) => setCountry(event.target.value)} />
          </FieldWrapper>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} aria-label={t("field.isActive")} />
            {active ? t("field.isActive") : t("switchedOff")}
          </label>
          {row && canRemove && (
            <div className="space-y-2 rounded-lg border border-destructive/20 p-3">
              <label className="flex items-start gap-2">
                <Switch
                  checked={removeArmed}
                  onCheckedChange={setRemoveArmed}
                  aria-label={t("remove.title", { name: row.name })}
                />
                <span className="text-xs text-muted-foreground">{t("remove.description")}</span>
              </label>
              {removeArmed && (
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={removal.isPending}
                  onClick={() => removal.mutate()}
                >
                  {removal.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {t("remove.confirm")}
                </Button>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            requires={[[name.trim(), t("field.name")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {common("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
