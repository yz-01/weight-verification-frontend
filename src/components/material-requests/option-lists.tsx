"use client";

/**
 * The MR form's lists, kept by the back office (C02): materials, each
 * material's specifications, and the company's own units beside the built-in
 * ones.
 *
 * Retired, never deleted: a request raised with an option keeps its own words
 * whatever happens here, and bringing an option back is one click.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useUnitLabel } from "@/components/material-requests/request-form";
import { LoadFailed } from "@/components/shared/page-primitives";
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
import { ApiError } from "@/interfaces/api";
import type { MaterialRequestOption, MaterialRequestOptionKind } from "@/interfaces/material-request";
import { cn } from "@/lib/utils";
import {
  createMaterialRequestOption,
  getMaterialRequestOptions,
  updateMaterialRequestOption,
} from "@/services/material-request.service";

export function OptionListsDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("materialRequest.options");
  const unitLabel = useUnitLabel();
  const options = useQuery({
    queryKey: ["material-request-options", "all"],
    queryFn: () => getMaterialRequestOptions(true),
  });
  const rows = options.data?.options ?? [];
  const materials = rows.filter((row) => row.kind === "MATERIAL");
  const [materialId, setMaterialId] = useState<string>("");
  const chosen = materials.find((row) => row.id === materialId) ?? materials[0] ?? null;
  const specifications = rows.filter((row) => row.kind === "SPECIFICATION" && chosen && row.parent === chosen.id);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        {options.isError && <LoadFailed what={t("title")} onRetry={() => void options.refetch()} />}
        <div className="grid gap-4 md:grid-cols-3">
          <OptionColumn
            title={t("materials")}
            kind="MATERIAL"
            rows={materials}
            selectedId={chosen?.id}
            onSelect={setMaterialId}
          />
          <OptionColumn
            title={chosen ? t("specificationsOf", { material: chosen.name }) : t("specificationList")}
            kind="SPECIFICATION"
            parent={chosen?.id ?? null}
            rows={specifications}
            disabledReason={chosen ? undefined : t("addMaterialFirst")}
          />
          <OptionColumn
            title={t("units")}
            kind="UNIT"
            rows={rows.filter((row) => row.kind === "UNIT")}
            builtIn={(options.data?.built_in_units ?? []).map(unitLabel)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OptionColumn({
  title,
  kind,
  rows,
  parent = null,
  selectedId,
  onSelect,
  builtIn = [],
  disabledReason,
}: {
  title: string;
  kind: MaterialRequestOptionKind;
  rows: MaterialRequestOption[];
  parent?: string | null;
  selectedId?: string;
  onSelect?: (id: string) => void;
  builtIn?: string[];
  disabledReason?: string;
}) {
  const t = useTranslations("materialRequest.options");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["material-request-options"] });
  const fail = (reason: unknown) => setError(reason instanceof ApiError ? reason.message : t("failed"));
  const add = useMutation({
    mutationFn: () => createMaterialRequestOption({ kind, name: name.trim(), parent }),
    onSuccess: () => {
      setName("");
      setError("");
      refresh();
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (row: MaterialRequestOption) => updateMaterialRequestOption(row.id, { is_active: !row.is_active }),
    onSuccess: refresh,
    onError: fail,
  });

  return (
    <section className="flex min-h-56 min-w-0 flex-col rounded-lg border bg-muted/30 p-3">
      <h3 className="panel-title mb-2">{title}</h3>
      {disabledReason ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <ul className="mb-2 max-h-64 flex-1 space-y-1 overflow-y-auto">
            {builtIn.map((label) => (
              <li key={`built-in-${label}`} className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-muted-foreground">
                <span>{label}</span>
                <span className="text-2xs">{t("builtIn")}</span>
              </li>
            ))}
            {rows.length === 0 && builtIn.length === 0 && <li className="px-2 py-1 text-xs text-muted-foreground">{t("empty")}</li>}
            {rows.map((row) => (
              <li
                key={row.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm",
                  selectedId === row.id && "bg-primary/10",
                  !row.is_active && "text-muted-foreground line-through",
                )}
              >
                {onSelect ? (
                  <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(row.id)}>
                    {row.name}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                )}
                <Switch
                  checked={row.is_active}
                  disabled={toggle.isPending}
                  aria-label={row.is_active ? t("retire", { name: row.name }) : t("restore", { name: row.name })}
                  onCheckedChange={() => toggle.mutate(row)}
                />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              value={name}
              maxLength={150}
              onChange={(event) => setName(event.target.value)}
              placeholder={t(`add.${kind}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) add.mutate();
              }}
            />
            <Button
              requires={[[name.trim(), t(`add.${kind}`)]]}
              disabled={add.isPending}
              onClick={() => add.mutate()}
              aria-label={t(`add.${kind}`)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
        </>
      )}
    </section>
  );
}
