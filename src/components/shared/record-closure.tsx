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
import { useDateFormat } from "@/lib/dates";
import {
  confirmRecordClosure,
  getRecordClosure,
} from "@/services/contractor-ops.service";

export function RecordClosurePanel({
  kind,
  recordId,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
}) {
  const t = useTranslations("recordClosure");
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const state = useQuery({
    queryKey: ["record-closure", kind, recordId],
    queryFn: () => getRecordClosure(kind, recordId),
  });

  const confirm = useMutation({
    mutationFn: () => confirmRecordClosure(kind, recordId, note.trim()),
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({
        queryKey: ["record-closure", kind, recordId],
      });
      // The record itself is now read-only, so anything showing it has to be
      // refetched rather than left offering actions that will be refused.
      void queryClient.invalidateQueries({ queryKey: ["archive-queue"] });
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
      <div className="rounded-lg border border-success/30 bg-success/5 p-3">
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

  return (
    <div className="space-y-2 rounded-lg border p-3">
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
