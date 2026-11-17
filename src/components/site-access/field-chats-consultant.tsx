"use client";

/**
 * 「沟通记录」 for a consultant (JB210, 客户 11-16: 「任务和沟通只显示顾问参与的记录」).
 *
 * Only the conversations he takes part in, on the project he is on: the
 * 资料包 sent to him, the 顾问申请 and 现场任务 he spoke in or was sent, and the
 * 整改 rooms he spoke in or was told of - the server's list
 * (`direct_chat.consultant_rows`). No 找人沟通 (Lucas 11-16 Q3 = A) and none of
 * the contractor's own talk. A task or an application opens its conversation
 * here; a 整改 and a 资料包 keep their own rooms, so their rows open those pages.
 */

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { OFFICE_FIELD_CHATS_KEY } from "@/components/site-access/field-chats-find";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getOfficeFieldChats, type OfficeFieldChat } from "@/services/field-conversations.service";

/** The kinds a consultant's list holds; the first two open here. */
const OPENS_HERE = ["FIELD_TASK", "CONSULTANT_APPLICATION"] as const;
type HereKind = (typeof OPENS_HERE)[number];
const KINDS = [...OPENS_HERE, "HAZARD", "PACKAGE"] as const;

const opensHere = (kind: string | undefined): kind is HereKind =>
  (OPENS_HERE as readonly string[]).includes(kind ?? "");

/** Where a row that keeps its own room opens. */
export function consultantChatHref(row: Pick<OfficeFieldChat, "id" | "kind">): string | null {
  if (row.kind === "HAZARD") return `/hazard-rectifications?incident=${encodeURIComponent(row.id)}`;
  if (row.kind === "PACKAGE") return `/package-reviews?package=${encodeURIComponent(row.id)}`;
  return null;
}

export function ConsultantFieldChats() {
  const t = useTranslations("fieldChats");
  const df = useDateFormat();
  const [picked, setPicked] = useState<OfficeFieldChat | null>(null);
  // The project he is on rides in every request (X-MSE-Project); the list is
  // that project's.
  const chats = useQuery({
    queryKey: [...OFFICE_FIELD_CHATS_KEY, "consultant"],
    queryFn: () => getOfficeFieldChats(),
  });
  const rows = chats.data?.results ?? [];

  return (
    <div className="space-y-4" data-consultant-chats>
      <ListHeader title={t("title")} subtitle={t("consultant.subtitle")} />
      <QueryFailedNote query={chats} what={t("title")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ul className="space-y-2" data-field-chats>
          {chats.isLoading ? (
            <li className="text-sm text-muted-foreground">{t("loading")}</li>
          ) : rows.length === 0 ? (
            <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("consultant.empty")}
            </li>
          ) : (
            rows.map((row) => {
              const href = consultantChatHref(row);
              const kind = (KINDS as readonly string[]).includes(row.kind ?? "") ? row.kind : null;
              const body = (
                <>
                  <span className="flex flex-wrap items-center gap-2">
                    {kind ? <StatusBadge label={t(`consultant.kind.${kind}`)} tone="neutral" /> : null}
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold">{row.title}</span>
                    {href ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" /> : null}
                  </span>
                  <span className="mt-1 block break-words text-xs text-muted-foreground">
                    {row.project_name}
                    {row.last_at ? ` · ${df.dateTime(row.last_at)}` : ""}
                  </span>
                  {row.last?.body ? (
                    <span className="mt-1 block line-clamp-2 text-xs">{row.last.body}</span>
                  ) : null}
                </>
              );
              const className = cn(
                "block w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/40",
                picked?.id === row.id && picked.kind === row.kind && "border-primary bg-primary/5",
              );
              return (
                <li key={`${row.kind}:${row.id}`} data-consultant-chat-row={row.kind}>
                  {href ? (
                    <Link href={href} className={className}>
                      {body}
                    </Link>
                  ) : (
                    <button type="button" className={className} onClick={() => setPicked(row)}>
                      {body}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
        <div className="surface-panel min-h-64 rounded-xl p-4">
          {picked && opensHere(picked.kind) ? (
            <RecordConversationPanel
              key={`${picked.kind}:${picked.id}`}
              kind={picked.kind}
              recordId={picked.id}
              labels={{ title: picked.title, empty: t("noMessages") }}
            />
          ) : (
            <p className="grid h-full place-items-center gap-2 text-sm text-muted-foreground">
              <MessagesSquare className="size-5" />
              {t("pick")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
