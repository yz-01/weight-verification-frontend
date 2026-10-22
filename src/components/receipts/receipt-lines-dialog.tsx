"use client";

/**
 * 「+ 增加材料」 on a delivery (J35): its materials, added, changed or removed.
 *
 * The client: 「一张DO来货里面有三种材料，不同规格，后台更改以后材料分类各自归档」.
 * The same MI, DO, photographs and signatures hold every line; each line files
 * under its own material and counts on its own. Line 1 is the delivery's own
 * material - changed here, never removed. A correction like any other: only a
 * specification or unit alone needs no PIN; anything else is signed and kept
 * in the history, so the reason is asked for.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { MaterialLinesEditor, useMaterialCatalogue } from "@/components/shared/material-lines";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { MaterialReceiptDetail } from "@/interfaces/contractor";
import {
  draftsFromReceiptLines,
  emptyLine,
  lineProblems,
  linesMoneyNote,
  receiptLinesPayload,
} from "@/lib/material-lines";
import { saveReceiptLines } from "@/services/contractor.service";

export function ReceiptLinesDialog({
  receipt,
  addOne = false,
  readOnlyFirst = false,
  onClose,
}: {
  receipt: MaterialReceiptDetail;
  /** Opened from 「+ 增加材料」: a new empty line is waiting at the end. */
  addOne?: boolean;
  /** Opened from the correction form, which edits line 1 itself. */
  readOnlyFirst?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("materialLines");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const stored = receipt.lines ?? [];
  const [lines, setLines] = useState(() => [
    ...draftsFromReceiptLines(stored),
    ...(addOne ? [emptyLine()] : []),
  ]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const eventId = useRef<string | null>(null);
  // query-failure: the editor below reads the same query and says when it fails.
  const catalogue = useMaterialCatalogue(receipt.project ?? "");
  const materials = catalogue.data?.materials ?? [];
  const storedIds = stored.map((line) => line.id).filter((id): id is string => Boolean(id));
  const complete = lines.every(
    (line) => lineProblems(line, materials, { stored: Boolean(line.id && storedIds.includes(line.id)) }).length === 0,
  );

  const moneyNote = linesMoneyNote(lines);

  const save = useMutation({
    mutationFn: () => {
      eventId.current ??= crypto.randomUUID();
      return saveReceiptLines(receipt.id, {
        lines: receiptLinesPayload(lines, materials),
        reason: reason.trim(),
        client_event_id: eventId.current,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
      void queryClient.invalidateQueries({ queryKey: ["record-corrections"] });
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["category-management"] });
      onClose();
    },
    onError: (failure) => {
      // A fresh attempt after a refusal is a new correction.
      eventId.current = null;
      setError(failure instanceof ApiError ? failure.message : t("saveFailed"));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { reference: receipt.receipt_no })}</DialogTitle>
          <DialogDescription>{t("dialogHelp")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldWrapper label={t("title")} required>
            <MaterialLinesEditor
              project={receipt.project ?? ""}
              lines={lines}
              onChange={(next) => {
                setError("");
                setLines(next);
              }}
              money
              keepFirst
              readOnlyFirst={readOnlyFirst}
              storedIds={storedIds}
            />
          </FieldWrapper>
          {moneyNote && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {t(moneyNote)}
            </p>
          )}
          <FieldWrapper label={t("reason")} required>
            <Textarea rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />
          </FieldWrapper>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t("pinNote")}
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            type="button"
            requires={[
              [complete, t("title")],
              [reason.trim(), t("reason")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="size-4" />
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
