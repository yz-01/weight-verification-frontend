"use client";

/**
 * 规格 under one material (I19, ID45): name and unit, add, rename, switch off,
 * remove - inside the material's own dialog in 分类管理.
 *
 * 「每种材料规格绑定对应单位」: every specification names the one unit it is
 * measured in, and MR, deliveries, returns and material targets take the unit
 * from it. 「其他」 is the system's: whoever chooses it types the
 * specification and picks the unit, so it has no unit here, and it is renamed,
 * never switched off or removed.
 *
 * Removing is armed by the row's switch, then the bin acts (rule 8). A
 * specification a record names is refused by the server, which says which.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import type { MaterialSpec, ProjectCategory } from "@/interfaces/contractor-ops";
import { offeredSpecs } from "@/lib/material-catalogue";
import {
  createProjectCategory,
  deleteProjectCategory,
  updateProjectCategory,
} from "@/services/contractor-ops.service";

/** A saved row, as the material's `specs` list carries it. */
export function asSpec(row: ProjectCategory): MaterialSpec {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    default_unit: row.default_unit ?? "",
    default_unit_label: row.default_unit_label ?? null,
    is_active: row.is_active,
    is_other: Boolean(row.is_other),
    is_fixed: Boolean(row.is_fixed),
    sort_order: row.sort_order,
  };
}

export function MaterialSpecsEditor({ material }: { material: ProjectCategory }) {
  const t = useTranslations("categoryManagement");
  const qc = useQueryClient();
  const unitName = useUnitName();
  const units = useMaterialUnits();
  const [specs, setSpecs] = useState<MaterialSpec[]>(material.specs ?? []);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftUnit, setDraftUnit] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState(material.default_unit ?? "");
  const [error, setError] = useState("");

  const refresh = () => {
    for (const queryKey of [["category-management"], ["project-categories"], ["material-catalogue"]]) {
      void qc.invalidateQueries({ queryKey });
    }
  };
  const failed = (reason: unknown) => setError(reason instanceof ApiError ? reason.message : t("saveFailed"));
  const replace = (row: ProjectCategory) =>
    setSpecs((current) => current.map((spec) => (spec.id === row.id ? asSpec(row) : spec)));

  const create = useMutation({
    mutationFn: () =>
      createProjectCategory({
        project: material.project,
        parent: material.id,
        kind: "MATERIAL",
        code: "",
        name: newName.trim(),
        default_unit: newUnit,
        sort_order: specs.filter((spec) => !spec.is_other).length,
      }),
    onSuccess: (row) => {
      setError("");
      setSpecs((current) => [...current, asSpec(row)]);
      setNewName("");
      refresh();
    },
    onError: failed,
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateProjectCategory>[1] }) =>
      updateProjectCategory(id, payload),
    onSuccess: (row) => {
      setError("");
      setEditing(null);
      replace(row);
      refresh();
    },
    onError: failed,
  });
  const removal = useMutation({
    mutationFn: (id: string) => deleteProjectCategory(id),
    onSuccess: (_, id) => {
      setError("");
      setArmed(null);
      setSpecs((current) => current.filter((spec) => spec.id !== id));
      refresh();
    },
    onError: (reason) => {
      setArmed(null);
      failed(reason);
    },
  });

  const unitOptions = units.data ?? [];
  const unitSelect = (value: string, onChange: (next: string) => void, label: string) => (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-40" aria-label={label}>
        <SelectValue placeholder={t("specs.chooseUnit")} />
      </SelectTrigger>
      <SelectContent>
        {unitOptions.map((unit) => (
          <SelectItem key={unit.code} value={unit.code}>
            {unitName(unit.code, unit.label)}
          </SelectItem>
        ))}
        {/* A unit switched off since it was chosen stays chosen. */}
        {value && !unitOptions.some((unit) => unit.code === value) && (
          <SelectItem value={value}>{unitName(value)}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid gap-3">
      <div>
        <h4 className="panel-title">{t("specs.title")}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{t("specs.help")}</p>
      </div>
      <QueryFailedNote query={units} what={t("units.what")} />
      <ul className="divide-y rounded-lg border">
        {offeredSpecs({ ...material, specs }, "").concat(specs.filter((spec) => !spec.is_active)).map((spec) => (
          <li key={spec.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            {editing === spec.id ? (
              <>
                <Input
                  className="min-w-0 flex-1"
                  aria-label={t("specs.name")}
                  value={draftName}
                  maxLength={150}
                  onChange={(event) => setDraftName(event.target.value)}
                />
                {!spec.is_other && unitSelect(draftUnit, setDraftUnit, t("specs.unit"))}
                <Button
                  size="icon-sm"
                  title={t("specs.save")}
                  disabledReason={
                    !draftName.trim()
                      ? t("specs.nameRequired")
                      : !spec.is_other && !draftUnit
                        ? t("specs.unitRequired")
                        : undefined
                  }
                  disabled={!draftName.trim() || (!spec.is_other && !draftUnit) || update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: spec.id,
                      payload: spec.is_other
                        ? { name: draftName.trim() }
                        : { name: draftName.trim(), default_unit: draftUnit },
                    })
                  }
                >
                  {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                </Button>
                <Button size="icon-sm" variant="ghost" title={t("specs.cancel")} onClick={() => setEditing(null)}>
                  <X />
                </Button>
              </>
            ) : (
              <>
                <span className={spec.is_active ? "min-w-0 flex-1 font-medium" : "min-w-0 flex-1 font-medium text-muted-foreground line-through"}>
                  {spec.name}
                </span>
                {spec.is_other ? (
                  <StatusBadge label={t("specs.otherBadge")} tone="neutral" />
                ) : (
                  <span className="text-sm text-muted-foreground">{unitName(spec.default_unit, spec.default_unit_label)}</span>
                )}
                <label className="flex items-center gap-1.5 text-xs" title={spec.is_fixed ? t("systemHelp") : undefined}>
                  <Switch
                    checked={spec.is_active}
                    disabled={spec.is_fixed || update.isPending}
                    onCheckedChange={(next) => update.mutate({ id: spec.id, payload: { is_active: next } })}
                    aria-label={t("specs.active", { name: spec.name })}
                  />
                  {t("specs.activeLabel")}
                </label>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t("edit")}
                  onClick={() => {
                    setEditing(spec.id);
                    setDraftName(spec.name);
                    setDraftUnit(spec.default_unit);
                  }}
                >
                  <Pencil />
                </Button>
                {!spec.is_fixed && (
                  <Switch
                    checked={armed === spec.id}
                    onCheckedChange={(next) => setArmed(next ? spec.id : null)}
                    aria-label={t("armRemove", { name: spec.name })}
                  />
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive"
                  title={t("specs.remove")}
                  disabledReason={spec.is_fixed ? t("systemHelp") : armed !== spec.id ? t("armFirst") : undefined}
                  disabled={spec.is_fixed || armed !== spec.id || removal.isPending}
                  onClick={() => removal.mutate(spec.id)}
                >
                  {removal.isPending && armed === spec.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <FieldWrapper label={t("specs.newName")} required>
          <Input
            value={newName}
            maxLength={150}
            placeholder={t("specs.newPlaceholder")}
            onChange={(event) => setNewName(event.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("specs.unit")} required>
          {unitSelect(newUnit, setNewUnit, t("specs.unit"))}
        </FieldWrapper>
        <Button
          requires={[
            [newName.trim(), t("specs.newName")],
            [newUnit, t("specs.unit")],
          ]}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          {t("specs.add")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
