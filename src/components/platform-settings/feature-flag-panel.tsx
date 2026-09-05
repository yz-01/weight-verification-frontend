"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FieldWrapper,
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { FeatureFlagRow } from "@/interfaces/platform-settings";
import { getCompanies } from "@/services/companies.service";
import {
  deleteFeatureFlag,
  getFeatureFlags,
  setFeatureFlag,
} from "@/services/platform-settings.service";

const FLAGS_KEY = ["platform-feature-flags"];

/** A flag key is what the code checks, so it may not carry spaces or case. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 功能开关 — turn a feature on for everybody, for a percentage, or for named
 * companies.
 *
 * The three controls are not independent, and the screen says so rather than
 * leaving an operator to discover it: a flag that is off reaches nobody
 * whatever the percentage says, and a company listed here is let in
 * regardless of the percentage. Showing the effective audience next to each
 * flag is the whole point — a rollout that silently reaches nobody looks
 * exactly like one that works.
 */
export function FeatureFlagPanel() {
  const t = useTranslations("adminSystemSettings.featureFlags");
  const common = useTranslations("common");
  const { can } = useAuth();
  const manage = can("platform_settings.manage");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FeatureFlagRow | "new" | null>(null);
  const [removing, setRemoving] = useState<FeatureFlagRow | null>(null);

  const rows = useQuery({ queryKey: FLAGS_KEY, queryFn: getFeatureFlags });
  const refresh = () => queryClient.invalidateQueries({ queryKey: FLAGS_KEY });

  const remove = useMutation({
    mutationFn: (row: FeatureFlagRow) => deleteFeatureFlag(row.key),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Flag className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t("title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("help")}</p>
          </div>
        </div>
        {manage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus />
            {t("action.create")}
          </Button>
        )}
      </div>

      {rows.isLoading ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          {common("loading")}
        </p>
      ) : rows.isError ? (
        <div className="mx-5 mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{t("loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void rows.refetch()}>
            {common("retry")}
          </Button>
        </div>
      ) : !(rows.data ?? []).length ? (
        <p className="mx-5 mb-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y border-t">
          {(rows.data ?? []).map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-medium">{row.key}</p>
                  <StatusBadge
                    label={row.is_enabled ? t("on") : t("off")}
                    tone={row.is_enabled ? "positive" : "neutral"}
                  />
                </div>
                {row.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {reachLabel(row, t)}
                </p>
              </div>
              {manage && (
                <div className="flex gap-1">
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
                    onClick={() => setRemoving(row)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FeatureFlagEditor
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setRemoving(null)}
          title={t("action.remove")}
          description={t("removeConfirm", { key: removing.key })}
          confirmLabel={t("action.remove")}
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  );
}

/** Who this flag actually reaches, said in one line. */
function reachLabel(
  row: FeatureFlagRow,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!row.is_enabled) return t("reach.nobody");
  const named = row.enabled_for_companies.length;
  if (row.rollout_pct >= 100) return t("reach.everyone");
  if (row.rollout_pct <= 0) {
    return named
      ? t("reach.namedOnly", { count: named })
      : t("reach.nobody");
  }
  return named
    ? t("reach.partialAndNamed", { percent: row.rollout_pct, count: named })
    : t("reach.partial", { percent: row.rollout_pct });
}

function FeatureFlagEditor({
  row,
  onClose,
  onSaved,
}: {
  row: FeatureFlagRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("adminSystemSettings.featureFlags");
  const common = useTranslations("common");
  const [key, setKey] = useState(row?.key ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [isEnabled, setIsEnabled] = useState(row?.is_enabled ?? false);
  const [rollout, setRollout] = useState(String(row?.rollout_pct ?? 100));
  const [companies, setCompanies] = useState<string[]>(
    row?.enabled_for_companies ?? [],
  );

  const companyRows = useQuery({
    queryKey: ["companies", "feature-flag-targets"],
    queryFn: () => getCompanies({ page_size: 200 }),
  });

  const rolloutValue = Number(rollout);
  const keyError =
    row === null && key.trim() && !KEY_PATTERN.test(key.trim())
      ? t("error.key")
      : null;
  const rolloutError =
    !Number.isInteger(rolloutValue) || rolloutValue < 0 || rolloutValue > 100
      ? t("error.rollout")
      : null;
  const canSave = Boolean(key.trim()) && !keyError && !rolloutError;

  const save = useMutation({
    mutationFn: () =>
      setFeatureFlag({
        key: key.trim(),
        description: description.trim(),
        is_enabled: isEnabled,
        rollout_pct: rolloutValue,
        enabled_for_companies: companies,
      }),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? t("action.edit") : t("action.create")}</DialogTitle>
          <DialogDescription>{t("editorHelp")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <FieldWrapper label={t("field.key")} required error={keyError ?? undefined}>
            <Input
              value={key}
              disabled={row !== null}
              placeholder={t("field.keyPlaceholder")}
              onChange={(event) => setKey(event.target.value)}
            />
          </FieldWrapper>
          {row !== null && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("keyLocked")}
            </p>
          )}

          <FieldWrapper label={t("field.description")}>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FieldWrapper>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("field.enabled")}</p>
              <p className="text-xs text-muted-foreground">
                {t("field.enabledHelp")}
              </p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <FieldWrapper
            label={t("field.rollout")}
            error={rolloutError ?? undefined}
          >
            <Input
              type="number"
              min={0}
              max={100}
              value={rollout}
              onChange={(event) => setRollout(event.target.value)}
            />
          </FieldWrapper>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("field.rolloutHelp")}
          </p>

          <div>
            <p className="text-sm font-medium">{t("field.companies")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("field.companiesHelp")}
            </p>
            {companyRows.isError ? (
              <LoadFailed onRetry={() => void companyRows.refetch()} />
            ) : companyRows.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline size-4 animate-spin" />
                {common("loading")}
              </p>
            ) : (
              <ul className="mt-2 max-h-48 divide-y overflow-y-auto rounded-md border">
                {(companyRows.data?.results ?? []).map((company) => (
                  <li key={company.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      id={`flag-company-${company.id}`}
                      checked={companies.includes(company.id)}
                      onCheckedChange={(checked) =>
                        setCompanies((current) =>
                          checked
                            ? [...current, company.id]
                            : current.filter((id) => id !== company.id),
                        )
                      }
                    />
                    <label
                      htmlFor={`flag-company-${company.id}`}
                      className="min-w-0 flex-1 cursor-pointer text-sm"
                    >
                      {company.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {company.code}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            requires={[[key, t("field.key")]]}
disabledReason={keyError || rolloutError || undefined}
            disabled={!canSave || save.isPending}
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
