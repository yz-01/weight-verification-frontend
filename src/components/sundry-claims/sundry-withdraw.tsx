"use client";

/**
 * 撤回 - the submitter takes back their own undecided sundry claim (I12-6).
 *
 * Armed with a switch first (never a confirmation dialog), as rejecting is.
 * The claim becomes 「已撤回」, its history is kept, and the reviewers' to-do
 * cards close.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import { withdrawSundryClaim } from "@/services/sundry-claim.service";

export function SundryWithdraw({ id, onDone }: { id: string; onDone?: () => void }) {
  const t = useTranslations("sundryClaim.withdraw");
  const qc = useQueryClient();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");
  const withdraw = useMutation({
    mutationFn: () => withdrawSundryClaim(id),
    onSuccess: () => {
      setArmed(false);
      void qc.invalidateQueries({ queryKey: ["sundry-claims"] });
      void qc.invalidateQueries({ queryKey: ["my-submissions"] });
      onDone?.();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("failed")),
  });
  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <label className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
        <Switch checked={armed} onCheckedChange={setArmed} aria-label={t("arm")} />
        <span>{t("arm")}</span>
      </label>
      <p className="text-xs text-muted-foreground">{t("help")}</p>
      <Button variant="outline" className="h-11 w-full" disabled={!armed || withdraw.isPending} onClick={() => withdraw.mutate()}>
        {withdraw.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
        {t("button")}
      </Button>
    </div>
  );
}
