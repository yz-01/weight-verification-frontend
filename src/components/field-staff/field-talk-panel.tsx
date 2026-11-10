"use client";

/**
 * 「沟通」 on the phone (JB104, 客户 11-05 事项 9 第 4 点).
 *
 * 「三个角色之间可以互相沟通，支持文字、照片及语音消息，沟通记录必须保留。同一建筑
 * 公司内的现场工作人员、设备操作人员及门岗人员可以互相联系」. One page on all three
 * phones: every conversation I am in, the newest first, with what is unread -
 * the record chats I take part in (a gate issue, a hazard, a delivery...) and
 * the ones with no record - and 「找人沟通」 to start one with one person or a
 * few. A conversation opens here with the chat every record already uses, so
 * text, photos and voice work as they do everywhere else, and nothing in it
 * can be deleted.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  FileText,
  Loader2,
  MessageSquarePlus,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { HazardConversationPanel } from "@/components/site-operations/hazard-conversation";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import { parseTalkParam, previewKey, talkParam, type TalkTarget } from "@/lib/field-talk";
import { cn } from "@/lib/utils";
import {
  FIELD_CONVERSATIONS_KEY,
  FIELD_TALK_UNREAD_KEY,
  getChatPeople,
  getChatProjects,
  getFieldConversations,
  getFieldTalkUnread,
  startConversation,
  type ChatPerson,
  type FieldConversationRow,
  type FieldConversations,
} from "@/services/field-conversations.service";

/** The 沟通 list: read only while the page is open (review F3). */
export const fieldConversationsQuery = {
  queryKey: FIELD_CONVERSATIONS_KEY,
  queryFn: getFieldConversations,
} as const;

/**
 * The number on 沟通's button, on every phone all the time: the cheap count,
 * never the list. A message moves it on the live stream (the record chat's
 * key family); the minute's poll is the net when the stream is down.
 */
export const fieldTalkUnreadQuery = {
  queryKey: FIELD_TALK_UNREAD_KEY,
  queryFn: getFieldTalkUnread,
  refetchInterval: 60_000,
} as const;

export function FieldTalkPanel() {
  const [chat, setChat] = useUrlSelection("chat");
  const [finding, setFinding] = useState(false);
  const target = parseTalkParam(chat);
  const conversations = useQuery(fieldConversationsQuery);
  const queryClient = useQueryClient();

  if (target) {
    const row = conversations.data?.results.find(
      (item) => item.kind === target.kind && item.id === target.id,
    );
    return (
      <TalkRoom
        target={target}
        title={row?.title}
        onBack={() => {
          setChat(null);
          // Read now: the list's and the button's numbers drop.
          void queryClient.invalidateQueries({ queryKey: FIELD_CONVERSATIONS_KEY });
          void queryClient.invalidateQueries({ queryKey: FIELD_TALK_UNREAD_KEY });
        }}
      />
    );
  }
  if (finding) {
    return (
      <FindPeople
        onBack={() => setFinding(false)}
        onStarted={(id) => {
          setFinding(false);
          setChat(talkParam({ kind: "DIRECT", id }));
        }}
      />
    );
  }
  return (
    <ConversationList
      query={conversations}
      onOpen={(row) => setChat(talkParam(row))}
      onFind={() => setFinding(true)}
    />
  );
}

function ConversationList({
  query,
  onOpen,
  onFind,
}: {
  query: UseQueryResult<FieldConversations>;
  onOpen: (row: FieldConversationRow) => void;
  onFind: () => void;
}) {
  const t = useTranslations("fieldStaffPwa.talk");
  const rows = query.data?.results ?? [];
  return (
    <section className="space-y-4" data-testid="field-talk">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button className="h-11 shrink-0" onClick={onFind}>
          <MessageSquarePlus />
          {t("find")}
        </Button>
      </div>
      {query.isError ? (
        <FieldLoadNote query={query} what={t("what")} />
      ) : !query.data ? (
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={`${row.kind}:${row.id}`}>
              <ConversationRow row={row} onOpen={() => onOpen(row)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConversationRow({ row, onOpen }: { row: FieldConversationRow; onOpen: () => void }) {
  const t = useTranslations("fieldStaffPwa.talk");
  const df = useDateFormat();
  const Icon = row.kind === "DIRECT" ? Users : row.kind === "HAZARD" ? ShieldAlert : FileText;
  const said = previewKey(row.last);
  const preview =
    said === "none"
      ? t("preview.none")
      : said === "text"
        ? row.last?.body ?? ""
        : t(`preview.${said}`);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="talk-row"
      className="surface-panel flex w-full min-w-0 items-start gap-3 rounded-xl p-3 text-left transition-colors hover:border-primary/50"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{df.dateTime(row.last_at)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {row.kind === "DIRECT" ? t("kind.direct") : row.kind === "HAZARD" ? t("kind.hazard") : t("kind.record")}
          {row.project_name ? ` · ${row.project_name}` : ""}
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", row.unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {row.last ? `${row.last.author_name}: ${preview}` : preview}
          </span>
          {row.unread > 0 ? (
            <span
              className="min-w-5 shrink-0 rounded-full bg-destructive px-1.5 text-center text-xs font-semibold leading-5 text-destructive-foreground tabular-nums"
              data-testid="talk-unread"
            >
              {row.unread > 99 ? "99+" : row.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function TalkRoom({
  target,
  title,
  onBack,
}: {
  target: TalkTarget;
  title?: string;
  onBack: () => void;
}) {
  const t = useTranslations("fieldStaffPwa.talk");
  const back = useTranslations("fieldStaffPwa.action");
  if (target.kind === "DIRECT") {
    // The whole screen, like a chat app (JB127, 客户 11-07 事项 7: 「把他的页面
    // 扩大好像微信上聊天」): bubbles above, the box at the bottom.
    return (
      <section className="fixed inset-0 z-50 flex flex-col bg-background" data-talk-room>
        <div className="flex min-w-0 shrink-0 items-center gap-3 border-b px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <Button size="icon" variant="outline" title={back("back")} onClick={onBack}>
            <ArrowLeft />
          </Button>
          <h2 className="min-w-0 truncate text-lg font-bold leading-tight">{title ?? t("title")}</h2>
        </div>
        <div className="min-h-0 flex-1">
          <RecordConversationPanel
            kind="DIRECT"
            recordId={target.id}
            chat
            labels={{ title: t("roomTitle", { people: title ?? "" }), empty: t("roomEmpty") }}
          />
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-4">
      <div className="flex min-w-0 items-center gap-3 border-b pb-3">
        <Button size="icon" variant="outline" title={back("back")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="min-w-0 truncate text-lg font-bold leading-tight">{title ?? t("title")}</h2>
      </div>
      {target.kind === "HAZARD" ? (
        <HazardConversationPanel incidentId={target.id} />
      ) : (
        <RecordConversationPanel kind={target.kind} recordId={target.id} />
      )}
    </section>
  );
}

export function FindPeople({ onBack, onStarted }: { onBack: () => void; onStarted: (id: string) => void }) {
  const t = useTranslations("fieldStaffPwa.talk");
  const back = useTranslations("fieldStaffPwa.action");
  const roleName = useTranslations("roles.system_");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  // One project at a time (JB127, 客户 11-07 事项 1: 「不同项目之间的数据及
  // 权限完全隔离」): its phone people and its office people only.
  const projects = useQuery({
    queryKey: ["field-conversations", "projects"],
    queryFn: getChatProjects,
    staleTime: 60_000,
  });
  const [pickedProject, setPickedProject] = useState("");
  const project = pickedProject || projects.data?.[0]?.id || "";
  const people = useQuery({
    queryKey: ["field-conversations", "people", project],
    queryFn: () => getChatPeople(project),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (people.data ?? []).filter((person) => !words || person.full_name.toLowerCase().includes(words));
  }, [people.data, search]);
  const start = useMutation({
    mutationFn: () => startConversation(chosen, chosen.length > 1 ? title.trim() : undefined, project),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: FIELD_CONVERSATIONS_KEY });
      onStarted(result.id);
    },
  });
  const toggle = (person: ChatPerson) =>
    setChosen((current) =>
      current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id],
    );
  const office = shown.filter((person) => person.phone_role === "office");
  const phones = shown.filter((person) => person.phone_role !== "office");

  const group = (label: string, rows: ChatPerson[]) =>
    rows.length ? (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <ul className="space-y-2">
          {rows.map((person) => {
            const on = chosen.includes(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  data-testid="talk-person"
                  onClick={() => toggle(person)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left",
                    on ? "border-primary bg-primary/10" : "bg-card",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{person.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.phone_role === "office" ? t("officePerson") : roleName(person.phone_role)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-panel-border",
                    )}
                  >
                    {on ? <Check className="size-4" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <section className="space-y-4">
      <div className="flex min-w-0 items-center gap-3 border-b pb-3">
        <Button size="icon" variant="outline" title={back("back")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{t("find")}</h2>
          <p className="text-xs text-muted-foreground">{t("findHint")}</p>
        </div>
      </div>
      {(projects.data?.length ?? 0) > 1 ? (
        <FieldWrapper label={t("project")}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("project")}>
            {(projects.data ?? []).map((row) => (
              <Button
                key={row.id}
                type="button"
                size="sm"
                variant={row.id === project ? "default" : "outline"}
                aria-pressed={row.id === project}
                onClick={() => {
                  setPickedProject(row.id);
                  setChosen([]);
                }}
              >
                {row.name}
              </Button>
            ))}
          </div>
        </FieldWrapper>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
      </div>
      {/* The start button needs at least one person: say so on the list. */}
      <FieldWrapper label={t("choose")} required>
        {projects.isError ? (
          <FieldLoadNote query={projects} what={t("whatPeople")} />
        ) : projects.data && projects.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noProject")}</p>
        ) : people.isError ? (
          <FieldLoadNote query={people} what={t("whatPeople")} />
        ) : !people.data ? (
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        ) : shown.length === 0 ? (
          // A project whose team holds nobody this phone may reach (since
          // JB157 never head office) said only 「找不到人。」 by a grey
          // 开始沟通 (客户 11-10, PUTRA_MAS): say why and who can fix it
          // (JB159 J). 「找不到人。」 stays for a search that found nobody.
          <p className="text-sm text-muted-foreground" data-empty={search.trim() ? "search" : "project"}>
            {search.trim() ? t("noPeople") : t("noPeopleOnProject")}
          </p>
        ) : (
          <div className="space-y-4">
            {group(t("projectOffice"), office)}
            {group(t("sameProject"), phones)}
          </div>
        )}
      </FieldWrapper>
      {chosen.length > 1 ? (
        <Input
          className="h-11"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("groupTitle")}
          aria-label={t("groupTitle")}
        />
      ) : null}
      {start.isError ? <p role="alert" className="text-sm text-destructive">{t("startFailed")}</p> : null}
      {/* A card of its own, so the list scrolls behind it and its 「还差这些
          没填」 never sits on a name (Lucas 11-05, 图1). */}
      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 rounded-xl border border-panel-border bg-card p-3 shadow-panel">
        <Button
          className="h-12 w-full"
          disabled={start.isPending}
          requires={[[chosen.length ? "yes" : "", t("choose")]]}
          onClick={() => start.mutate()}
        >
          {start.isPending ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />}
          {t("start", { count: chosen.length })}
        </Button>
      </div>
    </section>
  );
}
