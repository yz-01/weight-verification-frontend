"use client";

/**
 * The final 【确认】 that archives one record (D-234).
 *
 * The customer's #63/#64 replaced a gated design with one sentence:
 * 「**归档只需要最终【确认】。系统不再判断**沟通有没有结束、付款凭证够不够、
 * 事项是不是真的处理完…负责人确认早了是他的操作责任，系统照常记录确认人姓名、
 * User ID、确认时间。**归档后的原事项不可再修改**…**不需要另外增加开关**。」
 *
 * Three things follow, and each is a deliberate absence:
 *
 * * no checklist, because the system stopped judging;
 * * no arming switch, because 「都是后台内部人员操作，强制开关是对外部人才有必要」
 *   - this project's usual guard against a mis-tap is a switch (C-018), and
 *   this is the case the customer carved out of it;
 * * nothing per person. 「已看」 stays each reader's own (F-417); 「已确认」 is
 *   the company's. Two readers, two separate marks, one shared closure.
 *
 * What is *not* absent is the consequence: once this returns, the record is
 * read-only, so the button says so before it is pressed rather than after.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { type ReactNode, useState } from "react";

import { LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";
import { recordConversationKey } from "@/lib/record-chat";
import { useDateFormat } from "@/lib/dates";
import {
  confirmRecordClosure,
  getRecordClosure,
} from "@/services/contractor-ops.service";

/**
 * Whether this record has been confirmed and archived (A06).
 *
 * The same query, under the same key, as the panel above, so a record that
 * was just archived there stops offering uploads everywhere else without a
 * reload. Until the answer arrives it says "not archived": the server refuses
 * an archived upload with 409 either way, so this only decides whether the
 * button is shown.
 */
export function useRecordArchived(kind: ArchiveRecordKind, recordId: string | undefined) {
  // A failed read leaves the button shown; the server's 409 says why if it is archived.
  // query-failure: decides only whether an upload button shows
  const state = useQuery({
    queryKey: recordClosureKey(kind, recordId ?? ""),
    queryFn: () => getRecordClosure(kind, recordId!),
    enabled: Boolean(recordId),
  });
  return Boolean(state.data?.closure);
}

/** The one query key a record's closure is cached under. */
export function recordClosureKey(kind: ArchiveRecordKind, recordId: string) {
  return ["record-closure", kind, recordId] as const;
}

/**
 * The 【确认归档】 on a module's own detail page (2026-10 C4, X10).
 *
 * It used to live only in 现场记录中心's sheet, so 「等你处理」 sent a reader to
 * a business page where nothing could be confirmed. It now sits in each
 * module's detail and the record centre only reads.
 *
 * Offered only while the server says the record is `ready` - its own steps
 * done, a delivery accepted - which is the rule 「等你处理」 counts by. Before
 * that the module's own buttons (验收, 批准…) are the next step, and an early
 * confirm would lock the record against them (`ClosedRecordIsFinal`). So a
 * record that is not ready shows nothing here; one already confirmed says who
 * confirmed it and when.
 */
/**
 * Kinds that stay as decided even though archived records are changed (Lucas
 * 10-30: 杂费报销 「照旧不能改」 once decided), so their archive box does not
 * say 「仍可改正」.
 */
const FINAL_ONCE_DECIDED = new Set<string>(["SUNDRY_CLAIM"]);

export function RecordClosurePanel({
  kind,
  recordId,
  onConfirmed,
  blocked = null,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  /**
   * The module's own list, refreshed once the record is archived - a list
   * whose status reads the closure (工程进度, 2026-10-09) would otherwise go
   * on saying 「等待确认」 until its next poll.
   */
  onConfirmed?: () => void;
  /**
   * What the module still needs before it may be archived, said beside the
   * button and keeping it off: a return with no supplier (JB169, 客户 11-11
   * 「未选择供应商不能确认归档」), with 「补供应商」 as `action`. The server
   * refuses it too; this is so the refusal is never a surprise.
   */
  blocked?: { reason: string; action?: ReactNode } | null;
}) {
  const t = useTranslations("recordClosure");
  const tLink = useTranslations("jb279");
  const tChecklist = useTranslations("jb276");
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  // JB276: 「我已核对所有资料，确认无误。」 (必须勾选).
  const [ticked, setTicked] = useState(false);

  const state = useQuery({
    queryKey: recordClosureKey(kind, recordId),
    queryFn: () => getRecordClosure(kind, recordId),
  });

  const confirm = useMutation({
    mutationFn: () =>
      confirmRecordClosure(kind, recordId, note.trim(), Boolean(state.data?.checklist) && ticked),
    onSuccess: () => {
      setNote("");
      setTicked(false);
      void queryClient.invalidateQueries({
        queryKey: recordClosureKey(kind, recordId),
      });
      // The record itself is now read-only, so anything showing it has to be
      // refetched rather than left offering actions that will be refused.
      void queryClient.invalidateQueries({ queryKey: ["archive-queue"] });
      // Its conversation closes with it (D-278): the panel beside this one
      // swaps its composer for the reason without a reload.
      void queryClient.invalidateQueries({
        queryKey: recordConversationKey(kind, recordId),
      });
      // Confirmed is what 「等你处理」 and the sidebar's 待确认 badge count, so
      // the record leaves them now rather than at the next poll.
      void queryClient.invalidateQueries({ queryKey: ["contractor-dashboard"] });
      onConfirmed?.();
    },
  });

  if (state.isLoading) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  }

  // Not the confirm button: without the answer this record may already be
  // archived, and offering to archive it again would say it is not.
  if (state.isError) {
    return (
      <LoadFailed
        what={t("what.state")}
        onRetry={() => void state.refetch()}
        className="p-3"
      />
    );
  }

  if (state.data?.closed && state.data.closure) {
    const { confirmed_by_name, confirmed_at, note: reason } = state.data.closure;
    return (
      <div
        className="rounded-lg border border-success/30 bg-success/5 p-3"
        data-record-closure="closed"
      >
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="size-4" />
          {t("closedTitle")}
        </p>
        {/* Named, because the system no longer judges - the record has to say
            who did. */}
        <p className="mt-1 text-sm text-muted-foreground">
          {state.data.checklist
            ? // JB276: 材料进场 / 材料退场 - 「归档后，任何人均不得修改或删除该记录」.
              tChecklist("closedBy", {
                name: confirmed_by_name,
                when: formatter.dateTime(confirmed_at),
              })
            : t(FINAL_ONCE_DECIDED.has(kind) ? "closedByFinal" : "closedBy", {
                name: confirmed_by_name,
                when: formatter.dateTime(confirmed_at),
              })}
        </p>
        {reason && <p className="mt-2 text-sm">{reason}</p>}
      </div>
    );
  }

  // Its own steps are not done yet: the module's buttons come first.
  if (!state.data?.ready) return null;

  // JB276 (客户 11-26 事项 17): a 材料进场 / 材料退场 - the client's text, what
  // is still missing (the server refuses too), the tick, then the PIN.
  const checklist = Boolean(state.data.checklist);
  const missing = state.data.missing ?? [];
  // JB279: 「未完成关联，不允许确认归档」 - said beside the button, which stays
  // off until the record is linked to its MR / 其他申请 (「关联申请」 above).
  // On a 进场 / 退场 it is one line of 「以下必填资料不完整」 (`mr_link`, QA1
  // audit #15), never hidden behind another reason; on a 领用, its own line.
  const linkLine: { reason: string; action?: ReactNode } | null =
    state.data.mr_link_missing && !missing.includes("mr_link") ? { reason: tLink("archiveBlocked") } : null;
  const shownBlock = blocked ?? linkLine;
  const linkHidden = Boolean(blocked && linkLine);
  const missingReason = checklist && missing.length > 0 ? tChecklist("missingShort") : null;
  const tickReason = checklist && !ticked ? tChecklist("tickFirst") : null;
  // JB279 and JB276 both hold the button: the link first (said above), then
  // the checklist and the tick.
  const lockedReason = shownBlock?.reason ?? missingReason ?? tickReason ?? undefined;

  return (
    <div className="space-y-2 rounded-lg border p-3" data-record-closure="open">
      <p className="text-sm font-semibold">{t("title")}</p>
      <p className="text-xs leading-5 text-muted-foreground">
        {checklist ? tChecklist("help") : t("help")}
      </p>
      {checklist && missing.length > 0 && (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-sm"
          data-archive-missing
        >
          <p className="font-medium text-warning">{tChecklist("missingTitle")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {missing.map((code) => (
              <li key={code} data-archive-missing-item={code}>
                {tChecklist.has(`missing.${code}`) ? tChecklist(`missing.${code}`) : tChecklist("missing.other")}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("notePlaceholder")}
      />
      {/* The record panel's size, as the buttons above it in the same
          card (JB166, Lucas 11-11: 「这些按钮不consistent」). */}
      {shownBlock && (
        <div className="space-y-2" data-record-closure-blocked>
          <p role="status" className="rounded-md bg-warning/10 px-2 py-1.5 text-sm font-medium text-warning">
            {shownBlock.reason}
          </p>
          {shownBlock.action ?? null}
          {linkHidden && linkLine && (
            <p role="status" className="rounded-md bg-warning/10 px-2 py-1.5 text-sm font-medium text-warning" data-record-closure-link>
              {linkLine.reason}
            </p>
          )}
        </div>
      )}
      {checklist && (
        <label className="flex min-h-10 cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-sm" data-archive-tick>
          <Checkbox
            className="mt-0.5"
            checked={ticked}
            disabled={missing.length > 0}
            onCheckedChange={(next) => setTicked(next === true)}
          />
          <span>
            {tChecklist("tick")}
            <span className="ml-1 text-xs text-muted-foreground">{tChecklist("tickRequired")}</span>
          </span>
        </label>
      )}
      {checklist && <p className="text-xs text-muted-foreground">{tChecklist("pinNext")}</p>}
      <Button
        size="sm"
        disabled={confirm.isPending || Boolean(lockedReason)}
        disabledReason={lockedReason}
        onClick={() => confirm.mutate()}
      >
        {confirm.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <CheckCircle2 />
        )}
        {t("action")}
      </Button>
    </div>
  );
}
