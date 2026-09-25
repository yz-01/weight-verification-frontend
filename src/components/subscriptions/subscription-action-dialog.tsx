"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  CompanySubscription,
  SubscriptionPlan,
} from "@/interfaces/subscription";
import {
  changePlan,
  extendSubscription,
  setSeats,
  setSubscriptionPause,
  terminateSubscription,
} from "@/services/subscription.service";

export type SubscriptionActionMode =
  | "plan"
  | "extend"
  | "seats"
  | "pause"
  | "resume"
  | "terminate";

export function SubscriptionActionDialog({
  open,
  onOpenChange,
  mode,
  subscription,
  plans,
  plansFailed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SubscriptionActionMode;
  subscription: CompanySubscription | null;
  plans: SubscriptionPlan[];
  /** The caller's own failure note for the plan list, shown under the plan select. */
  plansFailed?: React.ReactNode;
}) {
  const t = useTranslations("subscriptions");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const availablePlans = useMemo(
    () =>
      plans.filter(
        (candidate) =>
          candidate.is_active &&
          candidate.audience === subscription?.company_type &&
          candidate.id !== subscription?.plan,
      ),
    [plans, subscription],
  );
  const [plan, setPlan] = useState(availablePlans[0]?.id ?? "");
  const [months, setMonths] = useState("1");
  const [expiryMode, setExpiryMode] = useState<"months" | "date">("months");
  const [expiresOn, setExpiresOn] = useState("");
  const [effectiveImmediately, setEffectiveImmediately] = useState(false);
  const [seatLimit, setSeatLimit] = useState(
    subscription?.user_limit === null || subscription?.user_limit === undefined
      ? ""
      : String(subscription.user_limit),
  );
  const [reason, setReason] = useState("");

  // Below the minimum is a wrong answer, not an absent one, so it shows
  // as an error on the field rather than as "still needs" on the button.
  const seatLimitTooLow = seatLimit !== "" && Number(seatLimit) < 1;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!subscription) throw new Error("subscription_required");
      if (mode === "plan") {
        return changePlan(subscription.id, {
          plan,
          months: Number(months) || undefined,
          effective_immediately: effectiveImmediately,
          reason: reason.trim(),
        });
      }
      if (mode === "extend") {
        return extendSubscription(subscription.id, {
          months: expiryMode === "months" ? Number(months) : undefined,
          expires_on: expiryMode === "date" ? expiresOn : undefined,
          reason: reason.trim(),
        });
      }
      if (mode === "seats") {
        return setSeats(subscription.id, {
          user_limit_override: seatLimit === "" ? null : Number(seatLimit),
          reason: reason.trim(),
        });
      }
      if (mode === "pause" || mode === "resume") {
        return setSubscriptionPause(
          subscription.id,
          mode === "pause" ? "PAUSE" : "RESUME",
          reason.trim(),
        );
      }
      return terminateSubscription(subscription.id, reason.trim());
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["subscription-plans"] }),
      ]);
      onOpenChange(false);
    },
  });

  if (!subscription) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`action.${mode}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`action.${mode}.description`, { company: subscription.company_name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "plan" && (
            <>
              <FieldWrapper label={t("field.plan")} required>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                >
                  {availablePlans.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} ({candidate.code})
                    </option>
                  ))}
                </select>
                {plansFailed}
              </FieldWrapper>
              <FieldWrapper label={t("field.termMonths")} required>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={months}
                  onChange={(event) => setMonths(event.target.value)}
                />
              </FieldWrapper>
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{t("field.effectiveImmediately")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("hint.effectiveImmediately")}
                  </p>
                </div>
                <Switch
                  checked={effectiveImmediately}
                  onCheckedChange={setEffectiveImmediately}
                />
              </div>
            </>
          )}

          {mode === "extend" && (
            <>
              <div className="grid grid-cols-2 rounded-md border p-1">
                {(["months", "date"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={expiryMode === value ? "secondary" : "ghost"}
                    onClick={() => setExpiryMode(value)}
                  >
                    {t(`extensionMode.${value}`)}
                  </Button>
                ))}
              </div>
              {expiryMode === "months" ? (
                <FieldWrapper label={t("field.extensionMonths")} required>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={months}
                    onChange={(event) => setMonths(event.target.value)}
                  />
                </FieldWrapper>
              ) : (
                <FieldWrapper label={t("field.expiresOn")} required>
                  <Input
                    type="date"
                    value={expiresOn}
                    onChange={(event) => setExpiresOn(event.target.value)}
                  />
                </FieldWrapper>
              )}
            </>
          )}

          {mode === "seats" && (
            <FieldWrapper
              label={t("field.userLimit")}
              optional={common("optional")}
              hint={t("hint.seatOverride")}
              error={seatLimitTooLow ? t("field.userLimitMin") : undefined}
            >
              <Input
                type="number"
                min={1}
                value={seatLimit}
                placeholder={t("hint.planDefault")}
                onChange={(event) => setSeatLimit(event.target.value)}
              />
            </FieldWrapper>
          )}

          {mode === "terminate" && (
            <div className="flex gap-3 border-y border-destructive/30 bg-destructive/5 py-3 text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">{t("hint.terminate")}</p>
            </div>
          )}

          <FieldWrapper label={t("field.reason")} required>
            <Textarea
              value={reason}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
            />
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {common("cancel")}
          </Button>
          <Button
            variant={mode === "terminate" ? "destructive" : "default"}
            requires={[[reason, t("field.reason")], [mode !== "plan" || plan, t("field.plan")], [mode !== "extend" || expiryMode !== "months" || Number(months) >= 1, t("field.extensionMonths")], [mode !== "extend" || expiryMode !== "date" || expiresOn !== "", t("field.expiresOn")]]}
            disabledReason={
              mode === "seats" && seatLimitTooLow
                ? t("field.userLimitMin")
                : undefined
            }
            disabled={mutation.isPending || (mode === "seats" && seatLimitTooLow)}
            onClick={() => mutation.mutate()}
          >
            {t(`action.${mode}.confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
