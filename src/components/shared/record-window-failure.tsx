"use client";

/**
 * Why a record's window has nothing to show (JB183 做法 3: 「记录已经被删除、
 * 或者这个账号没有权限看的，窗口里写清楚原因，不留空白、不跳走」).
 *
 * A record removed since (the server answers 404) and one this account may
 * not read (403) each say so in plain words; anything else is the house's
 * 「…没有读到」 with 【重试】. Never an empty window, never a jump elsewhere.
 */

import { useTranslations } from "next-intl";

import { QueryFailedNote } from "@/components/shared/page-primitives";
import { ApiError } from "@/interfaces/api";

/** Which of the plain reasons an error is, or null for any other failure. */
export function recordWindowReason(error: unknown): "gone" | "forbidden" | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return "gone";
  if (error.status === 403) return "forbidden";
  return null;
}

export function RecordWindowFailure({
  query,
  what,
}: {
  query: { isError: boolean; error: unknown; refetch?: () => unknown };
  /** The record, in words: 「项目进度摘要」. */
  what: string;
}) {
  const t = useTranslations("contractorReports.history.window");
  if (!query.isError) return null;
  const reason = recordWindowReason(query.error);
  if (reason) {
    return (
      <p role="alert" className="text-sm text-destructive" data-slot="record-window-failure" data-reason={reason}>
        {t(reason)}
      </p>
    );
  }
  return <QueryFailedNote query={query} what={what} />;
}
