"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { History, Info, Loader2, Lock, RotateCcw, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ListHeader, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/interfaces/api";
import {
  getRuleParameters,
  getRuleSets,
  publishRuleSet,
} from "@/services/weighing.service";

/**
 * The thresholds that decide what counts as tampering.
 *
 * The most consequential screen in the product, and the one where a careless
 * change does the most damage: widen a threshold far enough and the platform
 * stops noticing anything. So three things are deliberate here.
 *
 * Publishing creates a version rather than editing one, and the page says so
 * before the button is reachable. Weighings already judged keep the thresholds
 * that judged them, so this can never launder existing history.
 *
 * A reason is required. An auditor asking "why is the drop threshold 2000"
 * should find an answer next to the number rather than a blank field.
 *
 * Every value that differs from the platform default is marked, because a
 * settings page where nothing stands out is a settings page nobody reviews.
 */
export function DetectionSettings() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { can, user } = useAuth();

  // Held behind its own permission, separate from the rest of weighing: these
  // numbers decide what the platform treats as fraud, so a recycler who could
  // widen them would be deciding what gets noticed about their own yard.
  const editable = can("weighing.rule_update");

  // Only what the operator has typed, never a copy of the server's values.
  // Mirroring server state into local state means an effect to keep the two in
  // step, and an effect that writes state on every load is both a cascading
  // render and a race: a slow refetch would silently overwrite a half-finished
  // edit. Deriving the displayed value instead removes both problems.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parameters = useQuery({
    queryKey: ["weighing-rules", "parameters"],
    queryFn: getRuleParameters,
  });

  const ruleSets = useQuery({
    queryKey: ["weighing-rules", "list"],
    queryFn: () => getRuleSets({ page_size: 25 }),
  });

  const active = ruleSets.data?.results.find((entry) => entry.is_active);

  /** The thresholds in force, before anything the operator has typed. */
  const effective = useMemo(() => {
    const resolved = active?.resolved_params ?? {};
    return Object.fromEntries(
      (parameters.data ?? []).map((parameter) => [
        parameter.key,
        Number(resolved[parameter.key] ?? parameter.default),
      ]),
    );
  }, [parameters.data, active]);

  const valueOf = (key: string) =>
    overrides[key] ?? String(effective[key] ?? "");

  const publish = useMutation({
    mutationFn: () =>
      publishRuleSet({
        // Platform staff publish the platform default; a tenant publishes its
        // own override. Neither can touch the other's.
        scope: user?.is_platform_staff ? "PLATFORM" : "COMPANY",
        // The full set, not just the edits: a rule set is a complete
        // statement of the thresholds in force, so a later change to a platform
        // default cannot silently move a tenant's published threshold.
        params: Object.fromEntries(
          (parameters.data ?? []).map((parameter) => [
            parameter.key,
            Number(valueOf(parameter.key)),
          ]),
        ),
        reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["weighing-rules"] });
      setConfirming(false);
      setOverrides({});
      setReason("");
      setFormError(null);
    },
    onError: (error) => {
      setConfirming(false);
      if (error instanceof ApiError) setFormError(error.message);
    },
  });

  if (parameters.isLoading || ruleSets.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const changed = (parameters.data ?? []).filter(
    (parameter) => Number(valueOf(parameter.key)) !== effective[parameter.key],
  );

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("weighingRules.title")}
        subtitle={t("weighingRules.subtitle")}
        action={
          editable ? (
            <Button
              size="sm"
              className="rounded-full px-4 shadow-sm"
              disabledReason={changed.length === 0 ? t("common.noChanges") : undefined}
              disabled={changed.length === 0 || publish.isPending}
              onClick={() => setConfirming(true)}
            >
              {publish.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("weighingRules.publish")}
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          {active && (
            <>
              <TypeBadge
                label={t("weighing.rules.version", { version: active.version })}
              />
              <span className="text-sm text-muted-foreground">
                {t(`weighingRules.scope.${active.scope}`)}
              </span>
              <span className="tabular ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                {format(new Date(active.effective_from), "dd MMM yyyy HH:mm")}
              </span>
            </>
          )}
        </div>

        <div className="border-t px-6 py-4">
          {/* A page of greyed inputs with no explanation reads as broken. Say
              who owns these numbers and why the account cannot move them. */}
          <div
            className={
              editable
                ? "flex items-start gap-2.5 rounded-md border border-info/25 bg-info/8 px-3 py-2.5"
                : "flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning/10 px-3 py-2.5"
            }
          >
            {editable ? (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            )}
            <p className="text-sm text-foreground">
              {editable
                ? t("weighingRules.immutableHint")
                : t("weighingRules.readOnly")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t px-6 py-5 md:grid-cols-2 lg:grid-cols-3">
          {(parameters.data ?? []).map((parameter) => {
            const current = effective[parameter.key];
            const isChanged = Number(valueOf(parameter.key)) !== current;
            const isOverridden = current !== parameter.default;

            return (
              <div key={parameter.key} className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  {t(`weighingRules.param.${parameter.key}` as never)}
                  {isOverridden && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-warning"
                      title={t("weighingRules.overridden")}
                    />
                  )}
                </Label>
                <Input
                  type="number"
                  className={isChanged ? "border-info bg-card" : "bg-card"}
                  disabled={!editable}
                  value={valueOf(parameter.key)}
                  onChange={(event) =>
                    setOverrides((previous) => ({
                      ...previous,
                      [parameter.key]: event.target.value,
                    }))
                  }
                />
                <p className="tabular text-xs text-muted-foreground">
                  {isChanged
                    ? `${current} → ${valueOf(parameter.key)}`
                    : `${t("weighingRules.platformDefault")}: ${parameter.default}`}
                </p>
              </div>
            );
          })}
        </div>

        {(changed.length > 0 || formError) && (
          <div className="space-y-3 border-t px-6 py-5">
            {changed.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t("common.reason")}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  value={reason}
                  placeholder={t("common.reasonPlaceholder")}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            )}

            {formError && (
              <p className="text-sm font-medium text-destructive">{formError}</p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              onClick={() => {
                setOverrides({});
                setReason("");
                setFormError(null);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={() => setConfirming(false)}
          variant="default"
          title={t("weighingRules.publish")}
          description={t("weighingRules.immutableHint")}
          confirmLabel={t("weighingRules.publish")}
          confirmIcon={Upload}
          isPending={publish.isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() => publish.mutate()}
        />
      )}
    </div>
  );
}
