"use client";

/**
 * 「发送记录」 of one business record (JB65, 客户 10-29 事项 3 第 4 点): 「在业务
 * 详情页面增加「发送记录」，显示该业务资料曾经发送给谁、什么时候发送、通过什么
 * 方式发送。支持查看多次发送历史。」
 *
 * Every send of the record, newest first: to whom (name, company, phone or
 * email), how, when, by whom, and 已打开分享窗口 or 已确认发送 - with
 * 「标记为已发送」 on one that is still open. Drawn once in the record detail
 * frame (`record-detail-shell.tsx`), so every record kind has it; a detail
 * outside the frame draws it itself.
 *
 * The desktop only: the phone neither sends through the log nor reads it.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, useContext } from "react";
import { toast } from "sonner";

import { QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { FILE_SHARES_KEY } from "@/components/shared/send-recipient";
import { Button } from "@/components/ui/button";
import type { FileShare } from "@/interfaces/file-action";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { confirmFileShare, getRecordShares, signsFileActions } from "@/services/file-action.service";

/**
 * The record a detail is showing, for a send made inside it that does not
 * name the record itself - a photograph sent from the photo viewer - so it
 * still lands in that record's 发送记录. Set by the record detail frame.
 */
const RecordSendTargetContext = createContext<{ recordKind: string; recordId: string } | null>(null);
export const RecordSendTargetProvider = RecordSendTargetContext.Provider;
export function useRecordSendTarget() {
  return useContext(RecordSendTargetContext);
}

/** The query of one record's 发送记录. */
export function recordSharesKey(recordKind: string, recordId: string) {
  return [...FILE_SHARES_KEY, "record", recordKind, recordId] as const;
}

/** Newest first, whatever order they came in. */
export function newestFirst<T extends { created_at: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/**
 * One send, as a line of 发送记录: shared with an evidence package's own
 * 发送记录 (`SendLog`), which lists its in-system sends beside these.
 */
export function ShareLine({
  share,
  onMark,
  marking,
  extra,
}: {
  share: FileShare;
  onMark?: (id: string) => void;
  marking?: boolean;
  /** What else the caller says of it (a package's round). */
  extra?: React.ReactNode;
}) {
  const t = useTranslations("fileActions.send");
  const common = useTranslations("common");
  const formatter = useDateFormat();
  const confirmed = share.status === "CONFIRMED";
  return (
    <div className="space-y-1" data-share-row={share.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{share.recipient_name || "—"}</span>
        {share.recipient_company ? <span className="text-sm">{share.recipient_company}</span> : null}
        <StatusBadge label={t(`status.${share.status}`)} tone={confirmed ? "positive" : "warning"} />
      </div>
      <p className="text-sm">
        {t(share.method)}
        {" · "}
        {share.recipient_contact || <span className="text-muted-foreground">{t("log.noContact")}</span>}
        {extra ? <> · {extra}</> : null}
      </p>
      {share.file_name ? <p className="break-all text-xs text-muted-foreground">{share.file_name}</p> : null}
      <p className="text-xs text-muted-foreground">
        {t("log.by", { name: share.sent_by_name || "—", when: formatter.dateTime(share.created_at) })}
      </p>
      {confirmed ? (
        <p className="text-xs text-primary">
          {t("log.confirmedBy", {
            name: share.confirmed_by_name || "—",
            when: formatter.dateTime(share.confirmed_at),
          })}
        </p>
      ) : onMark ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-1"
          data-mark-sent
          disabled={marking}
          disabledReason={common("saving")}
          onClick={() => onMark(share.id)}
        >
          {t("log.markSent")}
        </Button>
      ) : null}
    </div>
  );
}

/** 「标记为已发送」, refreshing every 发送记录 and the operation log after. */
export function useMarkSent(onDone?: () => void) {
  const t = useTranslations("fileActions.send");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (share: string) => confirmFileShare(share),
    onSuccess: () => {
      toast.success(t("confirmed"));
      void queryClient.invalidateQueries({ queryKey: FILE_SHARES_KEY });
      void queryClient.invalidateQueries({ queryKey: ["file-actions"] });
      onDone?.();
    },
  });
}

export function RecordSendLog({
  recordKind,
  recordId,
  className,
}: {
  recordKind: string;
  recordId: string | null | undefined;
  className?: string;
}) {
  const office = signsFileActions();
  if (!recordId || !office) return null;
  return <RecordSendLogPanel recordKind={recordKind} recordId={recordId} className={className} />;
}

function RecordSendLogPanel({
  recordKind,
  recordId,
  className,
}: {
  recordKind: string;
  recordId: string;
  className?: string;
}) {
  const t = useTranslations("fileActions.send");
  const shares = useQuery({
    queryKey: recordSharesKey(recordKind, recordId),
    queryFn: () => getRecordShares(recordKind, recordId),
  });
  const mark = useMarkSent();
  const rows = newestFirst(shares.data ?? []);
  return (
    <section
      className={cn("surface-panel min-w-0 rounded-xl p-4", className)}
      aria-label={t("log.title")}
      data-record-send-log
    >
      <h3 className="panel-title mb-3">{t("log.title")}</h3>
      <QueryFailedNote query={shares} what={t("log.what")} />
      {shares.isSuccess && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("log.empty")}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((share) => (
            <li key={share.id} className="rounded-lg border p-3">
              <ShareLine share={share} onMark={(id) => mark.mutate(id)} marking={mark.isPending} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
