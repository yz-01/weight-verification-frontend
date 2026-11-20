"use client";

/**
 * 后台「手机沟通记录」 (JB127, 客户 11-07 事项 1 第 4、5 点: 「所有沟通内容，包括
 * 发送人、接收人、日期时间、文字及附件，必须自动保留在系统后台，并关联对应项目……
 * 后台必须能够查看完整沟通历史，不允许手机端有沟通记录，后台却完全查不到」).
 *
 * Every phone conversation of the projects this office account can see,
 * newest first, narrowed by project; one opens beside the list with the
 * record chat's own reader. The office answers the ones it is in (a guard or
 * an operator started it with the project office); the rest it reads.
 *
 * JB158 (客户 11-10 第七批): 「沟通记录」 - the back office's own conversations
 * too (a project office with head office, head office with a project's
 * office), and 「找人沟通」 for builder office accounts: the finder opens in
 * the right-hand panel, and the conversation it starts opens there.
 *
 * JB189 (客户 11-13: 「点击后，直接跳到现有「沟通记录」页面，进入该资料包对应的
 * 沟通事项」, Lucas chose A): the Multi Engine package conversations are rows
 * of the same list - one per package and recipient, that recipient's own
 * thread - and `?package_chat=<recipient id>` (the package's 「沟通」) opens
 * one. The page looks as it did; it only has these rows more.
 */

import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, MessagesSquare, Package, UsersRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  PACKAGE_CHAT_PARAM,
  PACKAGE_THREADS_KEY,
  PackageThreadPanel,
  packageThreadKey,
  recipientLabel,
} from "@/components/contractor-ops/package-exchange";
import { useAuth } from "@/components/providers/auth-provider";
import {
  useCurrentProject,
  useFollowRecordProject,
  usePageProject,
} from "@/components/providers/current-project-provider";
import { FieldWrapper, ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { ConsultantFieldChats } from "@/components/site-access/field-chats-consultant";
import {
  ChatBackToList,
  narrowChatLayout,
  OFFICE_FIELD_CHATS_KEY,
  OfficeFindPeople,
  useNarrowChatTop,
} from "@/components/site-access/field-chats-find";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import type { PackageThreadRow } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getPackageThreads } from "@/services/contractor-ops.service";
import { getOfficeFieldChats, type OfficeFieldChat } from "@/services/field-conversations.service";

/** What is open on the right: a conversation between people, or a package's thread (JB189). */
type Picked = { kind: "DIRECT" | "PACKAGE"; id: string };

type Entry =
  | { kind: "DIRECT"; id: string; at: number; row: OfficeFieldChat }
  | { kind: "PACKAGE"; id: string; at: number; row: PackageThreadRow };

/**
 * 「沟通记录」: the office's list, or a consultant's own (JB210, 客户 11-16:
 * 「任务和沟通只显示顾问参与的记录」).
 */
export function FieldChatsOffice() {
  const { user } = useAuth();
  return user?.account_type === "CONSULTANT" ? <ConsultantFieldChats /> : <OfficeFieldChats />;
}

function OfficeFieldChats() {
  const t = useTranslations("fieldChats");
  const df = useDateFormat();
  const params = useSearchParams();
  const [project, setProject] = usePageProject("", { all: "all" });
  // The top bar's project picker rules when it is on; then this one hides
  // itself, and so does its label.
  const topBar = useCurrentProject().active;
  // What the address names: a package's thread (JB189) or a conversation.
  const thread = params.get(PACKAGE_CHAT_PARAM);
  const chat = params.get("chat");
  const named: Picked | null = thread ? { kind: "PACKAGE", id: thread } : chat ? { kind: "DIRECT", id: chat } : null;
  const namedKey = named ? `${named.kind}:${named.id}` : "";
  const [picked, setPicked] = useState<Picked | null>(named);
  const [finding, setFinding] = useState(false);
  // JB191: a notice clicked while this page is already open names another
  // conversation in the address - the page stays, so it opens that one (a
  // new address is followed once; picking from the list afterwards is the
  // reader's own).
  const [followedKey, setFollowedKey] = useState(namedKey);
  if (namedKey !== followedKey) {
    setFollowedKey(namedKey);
    if (named) {
      setPicked(named);
      setFinding(false);
    }
  }
  const { user, can } = useAuth();
  // 找人沟通 is a builder office account's (JB158): a project office or head
  // office - the server decides whom each may reach.
  const mayStart = Boolean(
    user && user.company_type === "CONTRACTOR" && !user.is_field_staff && can("project.view"),
  );
  // JB189: whoever reads Multi Engine packages reads their conversations here.
  const readsPackages = can("package.view") || can("claim.view");
  const chats = useQuery({
    queryKey: [...OFFICE_FIELD_CHATS_KEY, project || "all"],
    queryFn: () => getOfficeFieldChats(project && project !== "all" ? project : undefined),
  });
  const packageThreads = useQuery({
    queryKey: [...PACKAGE_THREADS_KEY, project || "all"],
    queryFn: () => getPackageThreads(project && project !== "all" ? { project } : {}),
    enabled: readsPackages,
  });
  // The one a package's 「沟通」 opened, wherever its project is: the top bar
  // moves to that project so the list beside it holds the row (Q33.3).
  // query-failure: the thread panel on the right reads the same row and says when it failed.
  const openedThread = useQuery({
    queryKey: packageThreadKey(picked?.kind === "PACKAGE" ? picked.id : ""),
    queryFn: () => getPackageThreads({ recipient: picked!.id }),
    enabled: picked?.kind === "PACKAGE",
  });
  const followed = openedThread.data?.results[0];
  useFollowRecordProject(PACKAGE_CHAT_PARAM, followed ? { id: followed.id, project: followed.project } : null);

  const entries: Entry[] = [
    ...(chats.data?.results ?? []).map((row) => ({
      kind: "DIRECT" as const,
      id: row.id,
      at: Date.parse(row.last_at) || 0,
      row,
    })),
    ...(packageThreads.data?.results ?? []).map((row) => ({
      kind: "PACKAGE" as const,
      id: row.id,
      at: Date.parse(row.last_at) || 0,
      row,
    })),
  ].sort((a, b) => b.at - a.at);
  const loading = chats.isLoading || (readsPackages && packageThreads.isLoading);
  const open =
    picked?.kind === "DIRECT" ? ((chats.data?.results ?? []).find((row) => row.id === picked.id) ?? null) : null;
  const isPicked = (entry: Entry) => !finding && picked?.kind === entry.kind && picked.id === entry.id;
  // JB224 audit F2: on a phone the list or what opened, one at a time (the
  // same fault as the consultant's page: it opened below the list, unseen).
  const openKey = finding ? "find" : picked ? `${picked.kind}:${picked.id}` : "";
  const narrow = narrowChatLayout(Boolean(openKey));
  const top = useNarrowChatTop(openKey);

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          mayStart ? (
            <Button onClick={() => setFinding(true)} data-office-find-open>
              <MessageSquarePlus />
              {t("find.title")}
            </Button>
          ) : undefined
        }
      />
      {!topBar && (
        <FieldWrapper label={t("project")} className="max-w-md">
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("project")}
            allowAll
            allLabel={t("allProjects")}
          />
        </FieldWrapper>
      )}
      <QueryFailedNote query={chats} what={t("title")} />
      <QueryFailedNote query={packageThreads} what={t("packageKind")} />
      {/* JB202 (Lucas 11-16 「字被裁掉了」): `grid-cols-1` (a column that may
          be narrower than its longest line) - without it the list took the
          width of its longest name and ran past a phone's edge, cutting the
          time off each row. */}
      <div ref={top} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ul className={cn("space-y-2", narrow.list)} data-field-chats>
          {loading ? (
            <li className="text-sm text-muted-foreground">{t("loading")}</li>
          ) : entries.length === 0 ? (
            <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </li>
          ) : (
            entries.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`}>
                {entry.kind === "DIRECT" ? (
                  <ChatRow
                    row={entry.row}
                    active={isPicked(entry)}
                    onOpen={() => {
                      setFinding(false);
                      setPicked({ kind: "DIRECT", id: entry.id });
                    }}
                    when={df.dateTime(entry.row.last_at)}
                  />
                ) : (
                  <PackageChatRow
                    row={entry.row}
                    active={isPicked(entry)}
                    onOpen={() => {
                      setFinding(false);
                      setPicked({ kind: "PACKAGE", id: entry.id });
                    }}
                    when={df.dateTime(entry.row.last_at)}
                  />
                )}
              </li>
            ))
          )}
        </ul>
        <div className={cn("surface-panel min-h-64 rounded-xl p-4", narrow.panel)}>
          {finding ? (
            // The top bar's project, as the list beside it (JB159 K); a new
            // project there starts the finder afresh.
            <OfficeFindPeople
              key={project || "all"}
              project={project}
              onBack={() => setFinding(false)}
              onStarted={(id) => {
                setFinding(false);
                setPicked({ kind: "DIRECT", id });
              }}
            />
          ) : picked?.kind === "PACKAGE" ? (
            // The package and recipient's own thread (JB189): the same one as
            // the package window's 往来聊天.
            <div className="space-y-3">
              <ChatBackToList onBack={() => setPicked(null)} />
              <PackageThreadPanel key={picked.id} recipientId={picked.id} />
            </div>
          ) : picked ? (
            <div className="space-y-3">
              <ChatBackToList onBack={() => setPicked(null)} />
              {open ? (
                <div className="text-xs text-muted-foreground">
                  {open.project_name} · {t("people", { names: open.people.map((person) => person.name).join("、") })}
                </div>
              ) : null}
              {/* One not in the list yet (just started, or a notice's link
                  past the filter) opens all the same (JB158). */}
              <RecordConversationPanel
                key={picked.id}
                kind="DIRECT"
                recordId={picked.id}
                labels={{ title: open?.title ?? t("conversation"), empty: t("noMessages") }}
              />
            </div>
          ) : (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">{t("pick")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatRow({
  row,
  active,
  onOpen,
  when,
}: {
  row: OfficeFieldChat;
  active: boolean;
  onOpen: () => void;
  when: string;
}) {
  const t = useTranslations("fieldChats");
  const last = row.last;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
        active ? "border-primary bg-primary/10" : "bg-card hover:border-primary/50",
      )}
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted">
        {row.people.length > 2 ? <UsersRound className="size-4" /> : <MessagesSquare className="size-4" />}
      </span>
      {/* JB202: who is in the conversation and the project wrap instead of
          「阿明（现场）、示范 项目经理、示…」; the last message stays one line
          (free text - the row opens it). */}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 break-words text-sm font-semibold">{row.title}</span>
          <span className="shrink-0 text-2xs text-muted-foreground">{when}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 break-words text-xs text-muted-foreground">
          {/* JB224: a conversation with the project's consultant says so - his
              name alone does not tell the office who he is. */}
          {row.people.some((person) => person.phone_role === "consultant") ? (
            <span data-with-consultant>
              <StatusBadge label={t("find.kind.consultant")} tone="neutral" />
            </span>
          ) : null}
          {row.project_name}
        </span>
        <span className="block truncate text-xs">
          {last ? `${last.author_name}：${last.body || t("attachment")}` : t("noMessages")}
        </span>
      </span>
      {row.unread > 0 && (
        <span className="mt-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-2xs font-semibold text-destructive-foreground">
          {row.unread}
        </span>
      )}
    </button>
  );
}

/**
 * A package conversation in the same list (JB189): 「PKG 编号 · 接收方」, the
 * package's name and project, and the last thing said - drawn as a
 * conversation row is.
 */
function PackageChatRow({
  row,
  active,
  onOpen,
  when,
}: {
  row: PackageThreadRow;
  active: boolean;
  onOpen: () => void;
  when: string;
}) {
  const t = useTranslations("fieldChats");
  const words = useTranslations("multiEngine");
  const who = recipientLabel(words, row);
  const last = row.last;
  const author = last
    ? last.author_name || (last.side === "OFFICE" ? words("exchange.office") : who)
    : "";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={active}
      data-package-chat-row={row.id}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
        active ? "border-primary bg-primary/10" : "bg-card hover:border-primary/50",
      )}
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted">
        <Package className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          {/* JB202: the PKG number wraps instead of ending in 「…」. */}
          <span className="min-w-0 break-words text-sm font-semibold">{row.package_no}</span>
          <span className="shrink-0 text-2xs text-muted-foreground">{when}</span>
        </span>
        {/* The recipient on a line of its own: on one line with a long PKG
            number it was cut off, and a package's rows - one per recipient -
            all read the same (seen in the browser, 11-13). */}
        <span className="block break-words text-sm font-medium" data-package-chat-who>
          {who}
        </span>
        <span className="block break-words text-xs text-muted-foreground">
          {t("packageThread", { name: row.package_name })} · {row.project_name}
        </span>
        <span className="block truncate text-xs">
          {last ? `${author}：${last.body || last.attachment_name || t("attachment")}` : t("noMessages")}
        </span>
      </span>
      {/* JB191: the messages sent to me on this PKG I have not read - the same red number a conversation has. */}
      {(row.unread ?? 0) > 0 && (
        <span
          data-package-chat-unread={row.unread}
          className="mt-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-2xs font-semibold text-destructive-foreground"
        >
          {row.unread}
        </span>
      )}
    </button>
  );
}
