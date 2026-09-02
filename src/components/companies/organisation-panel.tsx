"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, Users2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/shared/page-primitives";
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
import type { Department, WorkTrade } from "@/interfaces/auth";
import {
  createDepartment,
  createWorkTrade,
  deleteDepartment,
  deleteWorkTrade,
  getDepartments,
  getWorkTrades,
  updateDepartment,
  updateWorkTrade,
} from "@/services/users.service";

/** The two lists behave identically; only the endpoints and labels differ. */
type Row = { id: string; code: string; name: string; is_active: boolean };

/**
 * The company's own departments and trades.
 *
 * Requirement 15.2.3 asks for the on-site headcount broken down by department
 * and by trade. Both are the contractor's own vocabulary, so both are lists the
 * contractor maintains — and until they can be maintained, those two slices of
 * the headcount are simply unavailable.
 */
export function OrganisationPanel() {
  const t = useTranslations("organisation");

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <Users2 className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("help")}</p>
      </div>
      <div className="grid gap-px bg-border md:grid-cols-2">
        <ListEditor kind="department" />
        <ListEditor kind="trade" />
      </div>
    </section>
  );
}

function ListEditor({ kind }: { kind: "department" | "trade" }) {
  const t = useTranslations("organisation");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  const permission = kind === "department" ? "department.manage" : "work_trade.manage";
  const canManage = can(permission);
  const queryKey = kind === "department" ? "company-departments" : "company-trades";

  const rows = useQuery({
    queryKey: [queryKey],
    queryFn: () =>
      kind === "department"
        ? getDepartments({ page_size: 200, sort_by: "code" })
        : getWorkTrades({ page_size: 200, sort_by: "code" }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: [queryKey] });

  const drop = useMutation({
    mutationFn: (row: Row) =>
      kind === "department" ? deleteDepartment(row.id) : deleteWorkTrade(row.id),
    onSuccess: refresh,
  });

  const listed: Row[] = (rows.data?.results ?? []) as Array<Department | WorkTrade>;

  return (
    <div className="bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{t(`${kind}.title`)}</p>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus />
            {t(`${kind}.add`)}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t(`${kind}.help`)}</p>

      {rows.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          {common("loading")}
        </p>
      ) : rows.isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{t("loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void rows.refetch()}>
            {common("retry")}
          </Button>
        </div>
      ) : !listed.length ? (
        <p className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t(`${kind}.empty`)}
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {listed.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="font-mono text-xs text-muted-foreground">
                  {row.code}
                </span>
                <span className="ml-2 text-sm">{row.name}</span>
                {!row.is_active && (
                  <StatusBadge label={t("inactive")} tone="neutral" />
                )}
              </span>
              {canManage && (
                <span className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title={common("edit")}
                    onClick={() => setEditing(row)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title={common("remove")}
                    disabled={drop.isPending}
                    onClick={() => drop.mutate(row)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <RowDialog
          kind={kind}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function RowDialog({
  kind,
  row,
  onClose,
  onSaved,
}: {
  kind: "department" | "trade";
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("organisation");
  const common = useTranslations("common");
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [isActive, setIsActive] = useState(row?.is_active ?? true);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        is_active: isActive,
      };
      if (kind === "department") {
        return row
          ? updateDepartment(row.id, { ...payload, parent: null })
          : createDepartment({ ...payload, parent: null });
      }
      return row ? updateWorkTrade(row.id, payload) : createWorkTrade(payload);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`${kind}.${row ? "edit" : "add"}`)}</DialogTitle>
          <DialogDescription>{t(`${kind}.help`)}</DialogDescription>
        </DialogHeader>
        <Input
          placeholder={t("field.code")}
          aria-label={t("field.code")}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Input
          placeholder={t("field.name")}
          aria-label={t("field.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label className="flex items-center gap-3 rounded-lg border p-3">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span className="text-sm">{t("field.active")}</span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            disabled={!code.trim() || !name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {common("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
