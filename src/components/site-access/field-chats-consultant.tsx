"use client";

/**
 * 「沟通记录」 for a consultant (JB210, 客户 11-16: 「任务和沟通只显示顾问参与的记录」).
 *
 * Only the conversations he takes part in, on the project he is on: the
 * 资料包 sent to him, the 顾问申请 and 现场任务 he spoke in or was sent, and the
 * 整改 rooms he spoke in or was told of - the server's list
 * (`direct_chat.consultant_rows`) - and none of the contractor's own talk. A
 * task or an application opens its conversation here; a 整改 and a 资料包 keep
 * their own rooms, so their rows open those pages.
 *
 * JB224 (客户 11-19 事项 4: 「顾问端却没有「找人沟通」按钮…顾问可以主动联系获授权
 * 项目的项目经理…双方支持发送文字、照片、语音及文件」): 【找人沟通】 lists the
 * project's office team (the shared office finder - the server decides who),
 * and his conversations with them open here, with the same message box as
 * everyone's. Each row shows what he has not read. A notice's link opens its
 * conversation and, when it names another of his projects, moves his project
 * box there first.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MessageSquarePlus, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import {
  ChatBackToList,
  narrowChatLayout,
  OFFICE_FIELD_CHATS_KEY,
  OfficeFindPeople,
  useNarrowChatTop,
} from "@/components/site-access/field-chats-find";
import { Button } from "@/components/ui/button";
import { useDateFormat } from "@/lib/dates";
import { setActiveProjectId } from "@/lib/project-context";
import { cn } from "@/lib/utils";
import { getOfficeFieldChats, type OfficeFieldChat } from "@/services/field-conversations.service";

/** The kinds a consultant's list holds; the first three open here. */
const OPENS_HERE = ["FIELD_TASK", "CONSULTANT_APPLICATION", "DIRECT"] as const;
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

type Picked = { kind: HereKind; id: string };

/**
 * A notice's link names its project (`?project=`, JB224): when it is another
 * of his current projects, the project box moves there - as choosing it at
 * the top would - so the conversation it names can open. Once per link.
 */
function useFollowLinkedProject(wanted: string | null) {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const tried = useRef<string | null>(null);
  const active = user?.active_project?.project_id ?? "";
  const his = (user?.consultant_projects ?? []).some(
    (project) => project.project_id === wanted && project.is_current,
  );
  useEffect(() => {
    if (!wanted || wanted === active || !his || tried.current === wanted) return;
    tried.current = wanted;
    setActiveProjectId(wanted);
    void (async () => {
      await queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      await refresh();
    })();
  }, [wanted, active, his, queryClient, refresh]);
}

export function ConsultantFieldChats() {
  const t = useTranslations("fieldChats");
  const df = useDateFormat();
  const params = useSearchParams();
  const { user } = useAuth();
  // His project: the one every request carries (X-MSE-Project).
  const project = user?.active_project?.project_id ?? "";
  useFollowLinkedProject(params.get("project"));
  // What the address names: a conversation from a notice (JB224).
  const chat = params.get("chat") ?? "";
  const [picked, setPicked] = useState<Picked | null>(chat ? { kind: "DIRECT", id: chat } : null);
  const [finding, setFinding] = useState(false);
  // A notice clicked while this page is open names another conversation in
  // the address: the page stays, so it opens that one (as the office's, JB191).
  const [followed, setFollowed] = useState(chat);
  if (chat !== followed) {
    setFollowed(chat);
    if (chat) {
      setPicked({ kind: "DIRECT", id: chat });
      setFinding(false);
    }
  }
  const chats = useQuery({
    queryKey: [...OFFICE_FIELD_CHATS_KEY, "consultant"],
    queryFn: () => getOfficeFieldChats(),
    // JB224 audit F7: no live stream serves him (`consultantChatPoll`) - a
    // new conversation or a reply shows on his list within half a minute.
    refetchInterval: 30_000,
  });
  const rows = chats.data?.results ?? [];
  const open = picked ? (rows.find((row) => row.kind === picked.kind && row.id === picked.id) ?? null) : null;
  // JB224 audit F2: on a phone the list or what opened, one at a time.
  const openKey = finding ? "find" : picked ? `${picked.kind}:${picked.id}` : "";
  const narrow = narrowChatLayout(Boolean(openKey));
  const top = useNarrowChatTop(openKey);

  return (
    <div className="space-y-4" data-consultant-chats>
      <ListHeader
        title={t("title")}
        subtitle={t("consultant.subtitle")}
        action={
          <Button onClick={() => setFinding(true)} data-consultant-find-open>
            <MessageSquarePlus />
            {t("find.title")}
          </Button>
        }
      />
      <QueryFailedNote query={chats} what={t("title")} />
      <div ref={top} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ul className={cn("space-y-2", narrow.list)} data-field-chats>
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
                    {row.unread > 0 ? (
                      <span
                        className="grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-2xs font-semibold text-destructive-foreground"
                        data-unread={row.unread}
                      >
                        {row.unread}
                      </span>
                    ) : null}
                    {href ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" /> : null}
                  </span>
                  <span className="mt-1 block break-words text-xs text-muted-foreground">
                    {row.project_name}
                    {row.last_at ? ` · ${df.dateTime(row.last_at)}` : ""}
                  </span>
                  {row.kind === "DIRECT" && row.last ? (
                    <span className="mt-1 block line-clamp-2 text-xs">
                      {`${row.last.author_name}：${row.last.body || t("attachment")}`}
                    </span>
                  ) : row.last?.body ? (
                    <span className="mt-1 block line-clamp-2 text-xs">{row.last.body}</span>
                  ) : null}
                </>
              );
              const className = cn(
                "block w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/40",
                !finding && picked?.id === row.id && picked.kind === row.kind && "border-primary bg-primary/5",
              );
              return (
                <li key={`${row.kind}:${row.id}`} data-consultant-chat-row={row.kind}>
                  {href ? (
                    <Link href={href} className={className}>
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={className}
                      onClick={() => {
                        if (!opensHere(row.kind)) return;
                        setFinding(false);
                        setPicked({ kind: row.kind, id: row.id });
                      }}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
        <div className={cn("surface-panel min-h-64 rounded-xl p-4", narrow.panel)}>
          {finding ? (
            // The project he is on; the server lists its office team only.
            <OfficeFindPeople
              key={project || "none"}
              project={project}
              onBack={() => setFinding(false)}
              onStarted={(id) => {
                setFinding(false);
                setPicked({ kind: "DIRECT", id });
              }}
            />
          ) : picked ? (
            <div className="space-y-3">
              <ChatBackToList onBack={() => setPicked(null)} />
              {open?.kind === "DIRECT" && open.people.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  {open.project_name} · {t("people", { names: open.people.map((person) => person.name).join("、") })}
                </div>
              ) : null}
              <RecordConversationPanel
                key={`${picked.kind}:${picked.id}`}
                kind={picked.kind}
                recordId={picked.id}
                labels={{ title: open?.title ?? t("conversation"), empty: t("noMessages") }}
              />
            </div>
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
