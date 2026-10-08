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
import { useState } from "react";

import { LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
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
export function RecordClosurePanel({
  kind,
  recordId,
  onConfirmed,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  /**
   * The module's own list, refreshed once the record is archived - a list
   * whose status reads the closure (工程进度, 2026-10-09) would otherwise go
   * on saying 「等待确认」 until its next poll.
   */
  onConfirmed?: () => void;
}) {
  const t = useTranslations("recordClosure");
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const state = useQuery({
    queryKey: recordClosureKey(kind, recordId),
    queryFn: () => getRecordClosure(kind, recordId),
  });

  const confirm = useMutation({
    mutationFn: () => confirmRecordClosure(kind, recordId, note.trim()),
    onSuccess: () => {
      setNote("");
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
          {t("closedBy", {
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

  return (
    <div className="space-y-2 rounded-lg border p-3" data-record-closure="open">
      <p className="text-sm font-semibold">{t("title")}</p>
      <p className="text-xs leading-5 text-muted-foreground">{t("help")}</p>
      <Textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("notePlaceholder")}
      />
      <Button
        className="w-full"
        disabled={confirm.isPending}
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
