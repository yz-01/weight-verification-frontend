"use client";

import { Loader2, Trash2, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The one confirmation dialog.
 *
 * Never `window.confirm`: it cannot be translated, cannot be styled, and on
 * some browsers it blocks the whole tab.
 *
 * The copy that arrives here is written in plain language on purpose. A
 * weighbridge operator confirming a removal should read what will happen to
 * their work, not "this record will be soft-deleted".
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmIcon: ConfirmIcon = Trash2,
  variant = "destructive",
  isPending = false,
  reason,
  onReasonChange,
  reasonRequired = false,
  reasonLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Icon for the confirm button. Every button carries one. */
  confirmIcon?: LucideIcon;
  variant?: "destructive" | "default";
  isPending?: boolean;
  /** Supply to collect a justification alongside the confirmation. */
  reason?: string;
  onReasonChange?: (value: string) => void;
  reasonRequired?: boolean;
  reasonLabel?: string;
  onConfirm: () => void;
}) {
  const t = useTranslations();
  const collectsReason = onReasonChange !== undefined;
  const blocked = reasonRequired && (reason ?? "").trim() === "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Only react to closing. Radix also reports opening here, and acting
        // on that would fight whatever opened the dialog in the first place.
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-[440px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {collectsReason && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {reasonLabel ?? t("common.reason")}
              {reasonRequired && (
                <span className="ml-0.5 text-destructive">*</span>
              )}
            </Label>
            <Textarea
              rows={3}
              value={reason ?? ""}
              placeholder={t("common.reasonPlaceholder")}
              onChange={(event) => onReasonChange?.(event.target.value)}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button
            variant={variant}
            size="sm"
            className="rounded-full px-4 shadow-sm"
            requires={[[!blocked, reasonLabel ?? t("common.reason")]]}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ConfirmIcon className="h-4 w-4" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
