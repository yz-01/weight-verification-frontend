"use client";

/**
 * 「单位管理」 (2026-10 A4): the units the company measures material in.
 *
 * Opened from Category Management beside the material categories, because a
 * unit is part of how a category is set up - 「钢筋」 is counted in 吨. The six
 * built-in units are always on the list; the office adds its own (卷, 支…),
 * renames them, and switches them off. Nothing is deleted: a delivery that
 * was measured in a unit keeps saying so.
 *
 * Switching is a switch, not a confirm dialog (spec rule 8).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MATERIAL_UNITS_QUERY_KEY, useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import type { MaterialUnitOption } from "@/interfaces/contractor";
import { createMaterialUnit, updateMaterialUnit } from "@/services/material-setup.service";

export function MaterialUnitsDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("categoryManagement.units");
  const qc = useQueryClient();
  const units = useMaterialUnits({ includeInactive: true });
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: [...MATERIAL_UNITS_QUERY_KEY] });
  const create = useMutation({
    mutationFn: () => createMaterialUnit({ label: label.trim() }),
    onSuccess: () => {
      setLabel("");
      setError("");
      refresh();
    },
    onError: (reason) =>
      setError(
        reason instanceof ApiError && reason.status === 400 ? t("duplicate") : t("what"),
      ),
  });
  const rows = units.data ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-end gap-2">
          <FieldWrapper label={t("label")} required className="flex-1">
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </FieldWrapper>
          <Button
            requires={[[label.trim(), t("label")]]}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("add")}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <QueryFailedNote query={units} what={t("what")} />
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <UnitRow key={row.id} row={row} onSaved={refresh} />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("offHint")}</p>
      </DialogContent>
    </Dialog>
  );
}

function UnitRow({ row, onSaved }: { row: MaterialUnitOption; onSaved: () => void }) {
  const t = useTranslations("categoryManagement.units");
  const unitName = useUnitName();
  const [label, setLabel] = useState(row.label);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (payload: { label?: string; is_active?: boolean }) => updateMaterialUnit(row.id, payload),
    onSuccess: () => {
      setError("");
      onSaved();
    },
    onError: (reason) =>
      setError(
        reason instanceof ApiError && reason.status === 400 ? t("duplicate") : t("what"),
      ),
  });
  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {row.built_in ? (
          // A built-in unit is named by translation, so there is nothing to rename.
          <span className="min-w-0 flex-1 text-sm font-medium">{unitName(row.code, row.label)}</span>
        ) : (
          <>
            <Input
              aria-label={t("label")}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="h-9 min-w-0 flex-1"
            />
            {label.trim() !== row.label && (
              <Button
                size="sm"
                variant="outline"
                disabledReason={!label.trim() ? t("label") : undefined}
                disabled={save.isPending || !label.trim()}
                onClick={() => save.mutate({ label: label.trim() })}
              >
                <Save />
                {t("save")}
              </Button>
            )}
          </>
        )}
        <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
        {row.built_in && <StatusBadge label={t("builtIn")} tone="neutral" />}
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={row.is_active}
            disabled={save.isPending}
            onCheckedChange={(checked) => save.mutate({ is_active: checked })}
            aria-label={row.is_active ? t("switchOff") : t("switchOn")}
          />
          {row.is_active ? t("active") : t("inactive")}
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
