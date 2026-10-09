"use client";

/**
 * The office corrects a progress record's 实际完成比例 (2026-10-09).
 *
 * Lucas: 「弄成可以修改百分比的吧，不然很乱不会用」. A pencil beside the figure in
 * the record's detail opens a small form in place: the new figure (0–100) and
 * a reason, both required. Only the figure changes - the photographs, GPS,
 * capture time and recorder are the site's evidence and the server never
 * touches them - and every change is kept and listed under the facts.
 *
 * A record archived by 【确认】 is still correctable (the figure is the
 * office's reading of the evidence), and says so while the form is open.
 */

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";

import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
import { ShellPanel } from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { ProgressCorrection, SiteProgressRecord } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { correctProgressPercent } from "@/services/contractor-ops.service";

/**
 * Why `value` cannot replace `current`, as a message key, or null when it can.
 *
 * The same two refusals the server makes (`percent_range`,
 * `percent_unchanged`), checked before sending so the reader is told at once.
 */
export function percentProblem(
  value: string,
  current: string,
): "range" | "unchanged" | null {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 100) return "range";
  if (Math.round(number * 100) === Math.round(Number(current) * 100)) return "unchanged";
  return null;
}

/** Whether the record's figure was ever corrected - the list's small hint. */
export function wasCorrected(record: Pick<SiteProgressRecord, "corrections">): boolean {
  return (record.corrections?.length ?? 0) > 0;
}

/** The small 「已修改」 tag beside a corrected figure. */
export function EditedTag() {
  const t = useTranslations("contractorOps.progress.correction");
  return <StatusBadge label={t("edited")} tone="info" />;
}

/**
 * 实际完成比例 in the detail's facts: the figure, a pencil for the office,
 * and - once pressed - the correction form in its place.
 */
export function ProgressPercentFact({
  record,
  canEdit,
  editing,
  onEditingChange,
  onSaved,
}: {
  record: SiteProgressRecord;
  canEdit: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSaved: (fresh: SiteProgressRecord) => void;
}) {
  const t = useTranslations("contractorOps.progress.correction");
  const [value, setValue] = useState(record.percent_complete);
  const [reason, setReason] = useState("");
  const problem = percentProblem(value, record.percent_complete);

  const save = useMutation({
    mutationFn: () => correctProgressPercent(record.id, value.trim(), reason.trim()),
    onSuccess: (fresh) => {
      setReason("");
      onSaved(fresh);
      onEditingChange(false);
    },
  });
  const failure = save.error instanceof ApiError ? save.error : null;

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="tabular">{record.percent_complete}%</span>
        {wasCorrected(record) && <EditedTag />}
        {canEdit && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("edit")}
            title={t("edit")}
            data-progress-percent-edit
            onClick={() => {
              setValue(record.percent_complete);
              setReason("");
              save.reset();
              onEditingChange(true);
            }}
          >
            <Pencil />
          </Button>
        )}
      </span>
    );
  }

  return (
    <div className="w-full space-y-2" data-progress-percent-form>
      <FieldWrapper
        label={t("newPercent")}
        required
        hint={t("was", { percent: record.percent_complete })}
        error={
          problem
            ? t(problem)
            : (failure?.fieldError("percent_complete") ?? undefined)
        }
      >
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.01"
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          className="max-w-36"
        />
      </FieldWrapper>
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
      <p className="text-xs text-muted-foreground">
        {record.archived ? t("archivedNote") : t("evidenceNote")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          requires={[
            [value.trim(), t("newPercent")],
            [reason.trim(), t("reason")],
          ]}
          disabled={save.isPending || problem !== null}
          disabledReason={problem ? t(problem) : undefined}
          onClick={() => save.mutate()}
        >
          {save.isPending && <Loader2 className="animate-spin" />}
          {t("save")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={save.isPending}
          onClick={() => onEditingChange(false)}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/** Every change to the figure, oldest first: old → new, who, when, why. */
export function ProgressCorrectionHistory({
  corrections,
}: {
  corrections: ProgressCorrection[];
}) {
  const t = useTranslations("contractorOps.progress.correction");
  const df = useDateFormat();
  if (corrections.length === 0) return null;
  return (
    <ShellPanel title={t("historyTitle")} className="space-y-2">
      <ol className="space-y-2" data-progress-corrections>
        {corrections.map((entry) => (
          <li key={entry.id} className="rounded-lg border p-3 text-sm">
            <p className="tabular font-medium">
              {t("change", { from: entry.old_percent, to: entry.new_percent })}
            </p>
            <p className="whitespace-pre-wrap">{entry.reason}</p>
            <p className="text-xs text-muted-foreground">
              {t("by", {
                name: entry.author_name ?? "—",
                at: df.dateTime(entry.created_at),
              })}
            </p>
          </li>
        ))}
      </ol>
    </ShellPanel>
  );
}
