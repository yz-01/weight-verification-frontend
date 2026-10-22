"use client";

/**
 * The shared 【改正】 and 「改正记录」 for every site record (I30, ID70, ID71).
 *
 * The client, 2026-10-15: 「现场人员如果写错没有更改系统里面就不会对了，就全部错了，
 * 比如设备名称或者供应商都会错信息，请检查一下所有事项，必须要有改正的按钮。」
 *
 * One button and one dialog for every module, drawn from what the server
 * says this record may have corrected: only the module's own list of fields
 * (ID71), each filled with what the record holds now, and a reason that is
 * always required. The evidence - photographs, GPS, times, signatures, what
 * was scanned, who submitted it - is never in the dialog, because the server
 * never offers it. Under the facts, 「改正记录」 lists every change: what it
 * was, what it became, who changed it, when and why.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ShellPanel } from "@/components/shared/record-detail-shell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type {
  CorrectableKind,
  CorrectionField,
  CorrectionHistoryKind,
  CorrectionSource,
} from "@/interfaces/record-correction";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  badNumber,
  changeDraft,
  isShown,
  lockedValue,
  offeredOptions,
  CORRECTION_PERMISSION,
  correctionChanges,
  groupCorrections,
  initialDraft,
  missingRequired,
  NO_CHOICE,
} from "@/lib/record-correction";
import {
  correctRecord,
  getCorrectionForm,
  listRecordCorrections,
} from "@/services/record-corrections.service";

/** The one query key a record's correction history is cached under. */
export function recordCorrectionsKey(kind: CorrectionHistoryKind, recordId: string) {
  return ["record-corrections", kind, recordId] as const;
}

/** Whether this account may correct this kind of record. */
export function useCanCorrect(kind: CorrectableKind): boolean {
  const { can } = useAuth();
  return can(CORRECTION_PERMISSION[kind]);
}

/** A field's name in the reader's language; its code if none is catalogued. */
function useFieldLabel() {
  const t = useTranslations("recordCorrection.field");
  return (name: string) => (t.has(name) ? t(name as never) : name);
}

const GOLD_TAG =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-gold/60 bg-gold/15 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-gold-fg";

/**
 * The gold 「已修改」 (J1-3, J1-4, J20): the same mark on every list a record
 * can be corrected in, at the front of its row, and for ever (Q1-5). Given
 * the record, a press opens its whole modification history.
 */
export function CorrectedTag({
  kind,
  recordId,
}: {
  kind?: CorrectionHistoryKind;
  recordId?: string;
} = {}) {
  const t = useTranslations("recordCorrection");
  const [open, setOpen] = useState(false);
  if (!kind || !recordId) {
    return (
      <span className={GOLD_TAG} data-corrected-tag>
        <PencilLine className="size-3" />
        {t("tag")}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={cn(GOLD_TAG, "cursor-pointer hover:bg-gold/25")}
        data-corrected-tag
        aria-label={t("openHistory")}
        onClick={(event) => {
          // The row opens the record; the tag opens its history.
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <PencilLine className="size-3" />
        {t("tag")}
      </button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{t("historyTitle")}</DialogTitle>
              <DialogDescription>{t("historyHelp")}</DialogDescription>
            </DialogHeader>
            <RecordCorrectionHistory kind={kind} recordId={recordId} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** The gold frame round a corrected row (J1-3, Q1-2). */
export const CORRECTED_ROW_CLASS = "outline outline-2 -outline-offset-2 outline-gold/70";

/**
 * 【改正】 for one record: shown only to whoever holds the module's 「管理」
 * permission. `onCorrected` refreshes the module's own detail and list.
 */
export function RecordCorrectionButton({
  kind,
  recordId,
  onCorrected,
}: {
  kind: CorrectableKind;
  recordId: string;
  onCorrected?: () => void;
}) {
  const t = useTranslations("recordCorrection");
  const allowed = useCanCorrect(kind);
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-record-correct={kind}
        onClick={() => setOpen(true)}
      >
        <PencilLine />
        {t("button")}
      </Button>
      {open && (
        <RecordCorrectionDialog
          kind={kind}
          recordId={recordId}
          onClose={() => setOpen(false)}
          onCorrected={onCorrected}
        />
      )}
    </>
  );
}

function CorrectionInput({
  field,
  value,
  onChange,
  options: offered,
  locked = false,
}: {
  field: CorrectionField;
  value: string;
  onChange: (value: string) => void;
  /** What a choice offers now (a specification only under its material). */
  options?: CorrectionField["options"];
  /** The unit a chosen specification brings: shown, not chosen (ID46). */
  locked?: boolean;
}) {
  const t = useTranslations("recordCorrection");
  if (field.type === "textarea") {
    return <Textarea rows={2} value={value} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.type === "choice") {
    const options = offered ?? field.options ?? [];
    return (
      <Select
        disabled={locked}
        value={value || (field.required ? "" : NO_CHOICE)}
        onValueChange={(next) => onChange(next === NO_CHOICE ? "" : next)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("choose")} />
        </SelectTrigger>
        <SelectContent>
          {!field.required && <SelectItem value={NO_CHOICE}>{t("none")}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "decimal") {
    return (
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === "datetime") {
    return (
      <Input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      value={value}
      maxLength={field.max_length ?? undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The dialog: the module's fields, filled with what the record holds, and a reason. */
export function RecordCorrectionDialog({
  kind,
  recordId,
  onClose,
  onCorrected,
}: {
  kind: CorrectableKind;
  recordId: string;
  onClose: () => void;
  onCorrected?: () => void;
}) {
  const t = useTranslations("recordCorrection");
  const fieldLabel = useFieldLabel();
  const queryClient = useQueryClient();
  const form = useQuery({
    queryKey: ["record-correction-form", kind, recordId],
    queryFn: () => getCorrectionForm(kind, recordId),
    // Always what the record holds now, never a value from an earlier open.
    staleTime: 0,
    gcTime: 0,
  });
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [reason, setReason] = useState("");
  const fields = form.data?.fields ?? [];
  // The draft starts from the record once its form has arrived.
  const values = draft ?? initialDraft(fields);
  const { changes, expected } = correctionChanges(fields, values);
  const unchanged = Object.keys(changes).length === 0;
  const missing = missingRequired(fields, values);
  const number = badNumber(fields, values);

  const save = useMutation({
    mutationFn: () => correctRecord(kind, recordId, changes, expected, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordCorrectionsKey(kind, recordId) });
      onCorrected?.();
      onClose();
    },
    onError: (error) => {
      // Somebody else corrected it meanwhile: start again from what it holds now.
      if (error instanceof ApiError && error.code === "correction_stale") {
        setDraft(null);
        void form.refetch();
      }
    },
  });
  const failure = save.error instanceof ApiError ? save.error : null;

  const disabledReason = unchanged
    ? t("unchanged")
    : missing
      ? t("missing", { field: fieldLabel(missing.name) })
      : number
        ? t("badNumber", { field: fieldLabel(number.name) })
        : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {form.data?.reference ? `${form.data.reference} · ` : ""}
            {t("hint")}
          </DialogDescription>
        </DialogHeader>
        {form.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : form.isError ? (
          <QueryFailedNote query={form} what={t("what")} />
        ) : form.data?.blocked ? (
          <p
            role="alert"
            data-record-correction-blocked={form.data.blocked.reason}
            className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm"
          >
            {t.has(`blocked.${form.data.blocked.reason}`)
              ? t(`blocked.${form.data.blocked.reason}` as never)
              : form.data.blocked.message}
          </p>
        ) : (
          <div className="grid gap-3" data-record-correction-form={kind}>
            {fields
              .filter((field) => isShown(fields, field, values))
              .map((field) => {
                const locked = lockedValue(fields, field, values) !== null;
                return (
                  <FieldWrapper
                    key={field.name}
                    label={fieldLabel(field.name)}
                    required={field.required}
                    hint={[
                      field.display ? t("was", { value: field.display }) : t("wasEmpty"),
                      locked ? t("followsSpec") : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    error={failure?.fieldError(field.name) ?? undefined}
                  >
                    <CorrectionInput
                      field={field}
                      value={values[field.name] ?? ""}
                      options={field.depends_on ? offeredOptions(field, values) : undefined}
                      locked={locked}
                      onChange={(next) => setDraft(changeDraft(fields, values, field.name, next))}
                    />
                  </FieldWrapper>
                );
              })}
            <FieldWrapper
              label={t("reason")}
              required
              error={failure?.fieldError("reason") ?? undefined}
            >
              <Textarea
                rows={2}
                value={reason}
                placeholder={t("reasonPlaceholder")}
                onChange={(event) => setReason(event.target.value)}
              />
            </FieldWrapper>
            <p className="text-xs text-muted-foreground">{t("evidenceNote")}</p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            {t("cancel")}
          </Button>
          {form.data && !form.data.blocked && (
            <Button
              type="button"
              requires={[[reason.trim(), t("reason")]]}
              disabledReason={disabledReason}
              disabled={save.isPending || Boolean(disabledReason)}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <PencilLine />}
              {t("save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SOURCE_KEY: Record<CorrectionSource, string> = {
  CORRECTION: "source.CORRECTION",
  MODULE: "source.CORRECTION",
  RETURN_NOTE: "source.RETURN_NOTE",
  EDIT: "source.EDIT",
};

/**
 * 「改正记录」: every change to this record, newest first - field, what it
 * was → what it became, who, when, why. Nothing when it was never corrected.
 */
export function RecordCorrectionHistory({
  kind,
  recordId,
}: {
  kind: CorrectionHistoryKind;
  recordId: string;
}) {
  const t = useTranslations("recordCorrection");
  const fieldLabel = useFieldLabel();
  const df = useDateFormat();
  const history = useQuery({
    queryKey: recordCorrectionsKey(kind, recordId),
    queryFn: () => listRecordCorrections(kind, recordId),
  });
  if (history.isError) {
    return (
      <ShellPanel title={t("historyTitle")}>
        <QueryFailedNote query={history} what={t("historyWhat")} />
      </ShellPanel>
    );
  }
  const rows = history.data?.corrections ?? [];
  if (rows.length === 0) return null;
  return (
    <ShellPanel title={t("historyTitle")} aside={<CorrectedTag />}>
      <ol className="space-y-2" data-record-corrections={kind}>
        {groupCorrections(rows).map((group) => {
          const first = group[0];
          return (
            <li key={first.batch} className="rounded-lg border p-3 text-sm">
              <ul className="space-y-0.5">
                {group.map((row) => (
                  <li key={row.id} className="break-words">
                    <span className="font-medium">
                      {fieldLabel(row.field)}
                      {row.item_label ? ` ${row.item_label}` : ""}
                    </span>
                    {": "}
                    <span className="text-muted-foreground line-through decoration-muted-foreground/60">
                      {row.value_from || t("empty")}
                    </span>
                    {" → "}
                    <span className="font-medium">{row.value_to || t("empty")}</span>
                  </li>
                ))}
              </ul>
              {first.reason && (
                <p className="mt-1 whitespace-pre-wrap">{t("reasonLine", { reason: first.reason })}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t(SOURCE_KEY[first.source] as never)} ·{" "}
                {first.corrected_by_name || t("someone")} · {df.dateTime(first.created_at)}
              </p>
            </li>
          );
        })}
      </ol>
    </ShellPanel>
  );
}
