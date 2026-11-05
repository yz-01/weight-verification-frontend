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
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import { parseTalkParam, previewKey, talkParam, type TalkTarget } from "@/lib/field-talk";
import { cn } from "@/lib/utils";
import {
  FIELD_CONVERSATIONS_KEY,
  getChatPeople,
  getFieldConversations,
  startConversation,
  type ChatPerson,
  type FieldConversationRow,
  type FieldConversations,
} from "@/services/field-conversations.service";

/** The 沟通 list, read by the page and by the number on its button. */
export const fieldConversationsQuery = {
  queryKey: FIELD_CONVERSATIONS_KEY,
  queryFn: getFieldConversations,
  // A message on a record moves it on the live stream; this is the net
  // under it when the stream is down.
  refetchInterval: 60_000,
} as const;

export function FieldTalkPanel() {
  const [chat, setChat] = useUrlSelection("chat");
  const [finding, setFinding] = useState(false);
  const target = parseTalkParam(chat);
  const conversations = useQuery(fieldConversationsQuery);

  if (target) {
    const row = conversations.data?.results.find(
      (item) => item.kind === target.kind && item.id === target.id,
    );
    return <TalkRoom target={target} title={row?.title} onBack={() => setChat(null)} />;
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
        <RecordConversationPanel
          kind={target.kind}
          recordId={target.id}
          labels={
            target.kind === "DIRECT"
              ? { title: t("roomTitle", { people: title ?? "" }), empty: t("roomEmpty") }
              : undefined
          }
        />
      )}
    </section>
  );
}

function FindPeople({ onBack, onStarted }: { onBack: () => void; onStarted: (id: string) => void }) {
  const t = useTranslations("fieldStaffPwa.talk");
  const back = useTranslations("fieldStaffPwa.action");
  const roleName = useTranslations("roles.system_");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const people = useQuery({
    queryKey: ["field-conversations", "people"],
    queryFn: () => getChatPeople(),
    staleTime: 60_000,
  });
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (people.data ?? []).filter((person) => !words || person.full_name.toLowerCase().includes(words));
  }, [people.data, search]);
  const start = useMutation({
    mutationFn: () => startConversation(chosen, chosen.length > 1 ? title.trim() : undefined),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: FIELD_CONVERSATIONS_KEY });
      onStarted(result.id);
    },
  });
  const toggle = (person: ChatPerson) =>
    setChosen((current) =>
      current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id],
    );
  const together = shown.filter((person) => person.same_project);
  const elsewhere = shown.filter((person) => !person.same_project);

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
                    <span className="block truncate text-xs text-muted-foreground">{roleName(person.phone_role)}</span>
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
      {people.isError ? (
        <FieldLoadNote query={people} what={t("whatPeople")} />
      ) : !people.data ? (
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPeople")}</p>
      ) : (
        <div className="space-y-4">
          {group(t("sameProject"), together)}
          {group(t("otherProjects"), elsewhere)}
        </div>
      )}
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
      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20">
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
