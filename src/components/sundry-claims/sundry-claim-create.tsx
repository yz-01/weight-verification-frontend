"use client";

/**
 * 新建报销 - a sundry claim raised from the back office (I12-6).
 *
 * The same claim as the phone's: it goes through `create_claim`, so the number,
 * the 「交给谁」 routing, who is told, who may decide, and the photos are
 * identical. Date, project, amount, description, the receipt photos (the shared
 * picker, with the server's own limits) and two big buttons for who approves.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import { createSundryClaim, getSundrySubmitOptions } from "@/services/sundry-claim.service";

/** The server's own ceiling (`MAX_ATTACHMENTS`); the attachments are photos. */
export const SUNDRY_MAX_ATTACHMENTS = 10;

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The claim's date as the server's `captured_at`: left out for today, so it is "now". */
export function claimDateToCapturedAt(date: string, todayValue: string = today()): string | undefined {
  if (!date || date === todayValue) return undefined;
  const at = new Date(`${date}T12:00:00`);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

export function SundryClaimCreate({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useTranslations("sundryClaim.create");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState("");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitTo, setSubmitTo] = useState<"PROJECT" | "HQ">("PROJECT");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState("");
  const validAmount = Number(amount) > 0;
  // A day after today is refused here with a sentence, not quietly changed.
  const futureDate = date > today();

  // Per side: is there anyone other than me who can decide? A side with nobody
  // is switched off with the reason, so the claim can never be stuck (I12-6).
  // query-failure: only dims nothing - the server refuses a side with nobody anyway
  const sides = useQuery({
    queryKey: ["sundry-claims", "submit-options", project],
    queryFn: () => getSundrySubmitOptions(project),
    enabled: open && Boolean(project),
  });
  const available = (side: "PROJECT" | "HQ") => sides.data?.[side] !== false;
  const chosen = available(submitTo) ? submitTo : (["PROJECT", "HQ"] as const).find(available);

  const reset = () => {
    setProject("");
    setDate(today());
    setAmount("");
    setDescription("");
    setSubmitTo("PROJECT");
    setAttachments([]);
    setError("");
  };

  const save = useMutation({
    mutationFn: () =>
      createSundryClaim({
        project,
        amount: amount.trim(),
        description: description.trim(),
        submit_to: chosen ?? submitTo,
        captured_at: claimDateToCapturedAt(date),
        attachments,
      }),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["sundry-claims"] });
      setOpen(false);
      reset();
      onCreated(row.id);
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("failed")),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("open")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FieldWrapper label={t("project")} required>
              <ProjectPicker value={project} onValueChange={setProject} placeholder={t("chooseProject")} className="w-full" />
            </FieldWrapper>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldWrapper label={t("date")} hint={t("dateHint")}>
                <Input type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} />
                {futureDate && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {t("dateFuture")}
                  </p>
                )}
              </FieldWrapper>
              <FieldWrapper label={t("amount")} required>
                <Input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </FieldWrapper>
            </div>
            <FieldWrapper label={t("descriptionLabel")} required>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("submitTo")} required="quiet" hint={t("submitToHint")}>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("submitTo")}>
                {(["PROJECT", "HQ"] as const).map((side) => (
                  <Button
                    key={side}
                    type="button"
                    role="radio"
                    aria-checked={chosen === side}
                    aria-disabled={!available(side)}
                    disabled={!available(side)}
                    variant={chosen === side ? "default" : "outline"}
                    className="h-12"
                    onClick={() => setSubmitTo(side)}
                  >
                    {t(`submitToOption.${side}`)}
                  </Button>
                ))}
              </div>
              {(["PROJECT", "HQ"] as const)
                .filter((side) => !available(side))
                .map((side) => (
                  <p key={side} className="mt-1 text-xs text-muted-foreground">
                    {t(`sideEmpty.${side}`)}
                  </p>
                ))}
            </FieldWrapper>
            <FieldWrapper label={t("attachments")} required hint={t("attachmentsHint", { count: SUNDRY_MAX_ATTACHMENTS })}>
              <AttachmentPicker
                files={attachments}
                showLimits={false}
                onChange={(next) => {
                  setError("");
                  setAttachments(next);
                }}
                rule={{ accept: "image/*", maxFiles: SUNDRY_MAX_ATTACHMENTS, multiple: true }}
              />
            </FieldWrapper>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              className="h-11 w-full"
              requires={[
                [project, t("project")],
                [validAmount, t("amount")],
                [description.trim(), t("descriptionLabel")],
                [attachments.length > 0, t("attachments")],
              ]}
              disabled={save.isPending || futureDate || !chosen}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="animate-spin" />}
              {t("submit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
