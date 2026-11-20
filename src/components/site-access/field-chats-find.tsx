"use client";

/**
 * 「找人沟通」 for the back office (JB158, 客户 11-10 第七批):
 *
 * 「2. 项目后台：可以联系本项目的手机端人员，也可以联系建筑商总部，不能直接联系其他
 * 项目后台。3. 建筑商总部：可以联系旗下所有项目后台，各项目后台也可以联系总部。」
 *
 * The phone's 找人沟通 (`field-talk-panel`) on 「沟通记录」: the project is the
 * one the top bar is on, as for the list beside it (JB159 K - project chips
 * here let a project office on three teams pick another project and read, to
 * the client, as 「项目可以和其他项目沟通？」), then the people the server says
 * this account may reach there, each with its kind. Head office may start on
 * every open project of its company, a project office on the ones it is on.
 * A phone person and head office never share a conversation (第 1 点), so
 * choosing one greys the other out and says why.
 *
 * JB224 (客户 11-19 事项 4, 「实现顾问与项目后台的双向沟通」): the project office
 * also finds the project's consultants (「顾问」, with the firm's name), and a
 * consultant uses this same finder on the project he is on - the server lists
 * him that project's office team only. A conversation with a consultant holds
 * that one consultant and office people of the project, so choosing him greys
 * the phone, head office and any other consultant out, and says why.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, MessageSquarePlus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OFFICE_FIELD_CHATS_KEY } from "@/lib/record-chat";
import { cn } from "@/lib/utils";
import {
  getOfficeChatPeople,
  getOfficeChatProjects,
  OFFICE_CHAT_PROJECTS_KEY,
  startOfficeConversation,
  type OfficeChatPerson,
} from "@/services/field-conversations.service";

/** The office list's queries: refreshed when a conversation starts (kept in `lib/record-chat`). */
export { OFFICE_FIELD_CHATS_KEY };

/** Below Tailwind's `lg`: the list and the right-hand panel share one column. */
const NARROW = "(max-width: 1023px)";

/**
 * 「沟通记录」 on a phone (JB224 audit 11-19 F2). Below `lg` the list and the
 * right-hand panel were one column, so 【找人沟通】 or a row opened its panel
 * under the list, out of sight, and the page seemed not to change - the
 * consultant, who has no phone app, pressed again and gave up. Narrow, one
 * shows at a time: the list until something opens, then the finder or the
 * conversation, with 【返回沟通列表】. Wide, both stand side by side as before.
 */
export function narrowChatLayout(open: boolean): { list: string; panel: string } {
  return open ? { list: "hidden lg:block", panel: "" } : { list: "", panel: "hidden lg:block" };
}

/**
 * The grid's top, brought back on screen when a phone changes between the list
 * and what opened (F2): a row pressed far down the list would otherwise leave
 * the page scrolled past the conversation's start. Nothing moves when it shows
 * already, or on a wide screen.
 */
export function useNarrowChatTop(openKey: string) {
  const top = useRef<HTMLDivElement>(null);
  // What showed last: the page's first paint moves nothing.
  const shown = useRef(openKey);
  useEffect(() => {
    if (shown.current === openKey) return;
    shown.current = openKey;
    const node = top.current;
    if (!node || !window.matchMedia(NARROW).matches) return;
    if (node.getBoundingClientRect().top < scrollerTop(node)) node.scrollIntoView({ block: "start" });
  }, [openKey]);
  return top;
}

/** Where the scrolling box around `node` starts on screen (the page's own, or 0). */
function scrollerTop(node: HTMLElement): number {
  for (let box = node.parentElement; box; box = box.parentElement) {
    const { overflowY } = window.getComputedStyle(box);
    if (overflowY === "auto" || overflowY === "scroll") return box.getBoundingClientRect().top;
  }
  return 0;
}

/** 【返回沟通列表】 above the finder or a conversation, on a phone only (F2). */
export function ChatBackToList({ onBack }: { onBack: () => void }) {
  const t = useTranslations("fieldChats");
  return (
    <Button type="button" variant="outline" className="h-11 lg:hidden" onClick={onBack} data-chat-back>
      <ArrowLeft />
      {t("backToList")}
    </Button>
  );
}

/**
 * What the finder says when a start was refused (JB224 audit 11-19 F10): the
 * true reason, once - the server's sentence was toasted while the panel said
 * 「请再试一次」, which never helps when the list changed or 「沟通记录」 closed.
 * `listChanged`: somebody chosen left the team meanwhile (the list is read
 * again); a refusal: the server's own sentence; no answer: try again.
 */
export function startRefusal(error: unknown): { key: "listChanged" | "startFailed" } | { message: string } {
  const { code, status, message } = (error ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  if (code === "chat_people_invalid") return { key: "listChanged" };
  if (typeof status === "number" && status > 0 && typeof message === "string" && message) return { message };
  return { key: "startFailed" };
}

export type PersonGroup = "phone" | "office" | "head_office" | "consultant";

/** The list's groups, in its order. */
const GROUPS: readonly PersonGroup[] = ["phone", "office", "head_office", "consultant"];

/** Which group of the list a person is in, in the list's order. */
export function personGroup(person: Pick<OfficeChatPerson, "kind">): PersonGroup {
  return person.kind === "office" || person.kind === "head_office" || person.kind === "consultant"
    ? person.kind
    : "phone";
}

export type MixReason =
  | ""
  | "phoneChosen"
  | "headOfficeChosen"
  | "consultantChosen"
  | "notWithConsultant"
  | "oneConsultant";

/**
 * Why `person` cannot join the people already chosen, or `""` (客户 11-10
 * 第七批 第 1 点: the phone never reaches head office; JB224: a consultant
 * talks with the project's office people only, one consultant at a time).
 * The server refuses the mix as well; this says so before anybody presses start.
 */
export function mixBlock(
  person: Pick<OfficeChatPerson, "kind">,
  chosen: readonly Pick<OfficeChatPerson, "kind">[],
): MixReason {
  const group = personGroup(person);
  const has = (name: PersonGroup) => chosen.some((other) => personGroup(other) === name);
  if (group === "consultant") {
    if (has("consultant")) return "oneConsultant";
    if (has("phone") || has("head_office")) return "notWithConsultant";
    return "";
  }
  if ((group === "phone" || group === "head_office") && has("consultant")) return "consultantChosen";
  if (group === "head_office" && has("phone")) return "phoneChosen";
  if (group === "phone" && has("head_office")) return "headOfficeChosen";
  return "";
}

/** The backend's `OPEN_PROJECT_STATUSES`: where a conversation may start. */
const OPEN_PROJECT_STATUSES = ["PLANNING", "ACTIVE"];

/** Why nobody is listed for the page's project, or `""` when the list can show (JB159 K). */
export function findProjectBlock(input: {
  /** The page's project: one id, or "" / "all" for 「全部项目」. */
  project: string;
  /** The projects this account may start on (the server's `office_projects`), once loaded. */
  mine: readonly { id: string }[] | undefined;
  /** The top bar's status for the project, when it knows it. */
  status?: string;
}): "" | "pickProject" | "noProject" | "projectClosed" | "notOnTeam" {
  if (!input.project || input.project === "all") return "pickProject";
  if (input.mine === undefined || input.mine.some((row) => row.id === input.project)) return "";
  if (input.mine.length === 0) return "noProject";
  // A project that has ended takes no new conversation, team or not.
  if (input.status && !OPEN_PROJECT_STATUSES.includes(input.status)) return "projectClosed";
  return "notOnTeam";
}

export function OfficeFindPeople({
  project,
  onBack,
  onStarted,
}: {
  /** The page's project - the top bar's: one id, or "" / "all" for 「全部项目」. */
  project: string;
  onBack: () => void;
  onStarted: (id: string) => void;
}) {
  const t = useTranslations("fieldChats.find");
  const queryClient = useQueryClient();
  // JB224: a consultant's finder lists the project office only - said so.
  const consultant = useAuth().user?.account_type === "CONSULTANT";
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const projects = useQuery({
    queryKey: OFFICE_CHAT_PROJECTS_KEY,
    queryFn: getOfficeChatProjects,
    staleTime: 60_000,
  });
  const topBarProjects = useCurrentProject().projects;
  const block = findProjectBlock({
    project,
    mine: projects.data,
    status: topBarProjects?.find((row) => row.id === project)?.status,
  });
  const listable = !block && projects.data !== undefined;
  const people = useQuery({
    queryKey: ["field-chats", "people", project],
    queryFn: () => getOfficeChatPeople(project),
    enabled: listable,
    staleTime: 60_000,
  });
  const everyone = useMemo(() => people.data ?? [], [people.data]);
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return everyone.filter((person) => !words || person.full_name.toLowerCase().includes(words));
  }, [everyone, search]);
  const chosenPeople = everyone.filter((person) => chosen.includes(person.id));
  const start = useMutation({
    mutationFn: () => startOfficeConversation(chosen, chosen.length > 1 ? title.trim() : undefined, project),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: OFFICE_FIELD_CHATS_KEY });
      onStarted(result.id);
    },
    // F10: the list changed under the reader - read it again, choose again.
    onError: (error) => {
      const said = startRefusal(error);
      if ("key" in said && said.key === "listChanged") {
        setChosen([]);
        void queryClient.invalidateQueries({ queryKey: ["field-chats", "people", project] });
      }
    },
  });
  const refusal = start.isError ? startRefusal(start.error) : null;
  const toggle = (person: OfficeChatPerson) => {
    // A new choice answers the refusal: its sentence goes.
    if (start.isError) start.reset();
    setChosen((current) =>
      current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id],
    );
  };

  const group = (name: PersonGroup) => (
    <OfficePersonGroup
      name={name}
      rows={shown.filter((person) => personGroup(person) === name)}
      chosen={chosen}
      chosenPeople={chosenPeople}
      onToggle={toggle}
    />
  );

  return (
    <section className="space-y-4" data-office-find>
      {/* F2: on a phone the finder has the screen; this takes it back to the list. */}
      <ChatBackToList onBack={onBack} />
      <div className="flex min-w-0 items-center gap-3 border-b pb-3">
        <Button
          size="icon"
          variant="outline"
          className="hidden lg:inline-flex"
          title={t("back")}
          aria-label={t("back")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t(consultant ? "hintConsultant" : "hint")}</p>
        </div>
      </div>
      <QueryFailedNote query={projects} what={t("whatProjects")} />
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
        {projects.isError ? null : block ? (
          <p className="text-sm text-muted-foreground" data-find-block={block}>
            {t(block)}
          </p>
        ) : !listable ? (
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        ) : people.isError ? (
          <QueryFailedNote query={people} what={t("whatPeople")} />
        ) : !people.data ? (
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        ) : shown.length === 0 ? (
          // Nobody on the project at all is said as such, with what to do
          // (JB159 J); 「找不到人。」 stays for a search that found nobody.
          <p className="text-sm text-muted-foreground" data-empty={search.trim() ? "search" : "project"}>
            {search.trim() ? t("noPeople") : consultant ? t("noOfficeForConsultant") : t("noPeopleOnProject")}
          </p>
        ) : (
          <div className="space-y-4">{GROUPS.map((name) => <Fragment key={name}>{group(name)}</Fragment>)}</div>
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
      {refusal ? (
        <p role="alert" className="text-sm text-destructive" data-start-refusal>
          {"message" in refusal ? refusal.message : t(refusal.key)}
        </p>
      ) : null}
      <Button
        className="h-11 w-full"
        disabled={start.isPending}
        requires={[[chosen.length ? "yes" : "", t("choose")]]}
        onClick={() => start.mutate()}
      >
        {start.isPending ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />}
        {t("start", { count: chosen.length })}
      </Button>
    </section>
  );
}

/**
 * One group of the list: the phone, the project office or head office.
 *
 * A group greyed out by the people already chosen (第 1 点) says why under
 * its heading (JB159, shot c03): the buttons' own tooltip never opened on
 * hover - a disabled button takes no pointer - so the reason was never seen.
 */
export function OfficePersonGroup({
  name,
  rows,
  chosen,
  chosenPeople,
  onToggle,
}: {
  name: PersonGroup;
  rows: readonly OfficeChatPerson[];
  chosen: readonly string[];
  chosenPeople: readonly OfficeChatPerson[];
  onToggle: (person: OfficeChatPerson) => void;
}) {
  const t = useTranslations("fieldChats.find");
  // The phone's own words for its people (门岗保安, 设备操作人员), so both
  // 找人沟通 call them the same (JB159).
  const roleName = useTranslations("roles.system_");
  if (!rows.length) return null;
  // Said for the rows still open to choose: with one consultant chosen, the
  // others in his group grey out too (JB224), and say why here.
  const open = rows.filter((person) => !chosen.includes(person.id));
  const groupBlock = open.length ? mixBlock(open[0], chosenPeople) : "";
  return (
    <div className="space-y-2" data-person-group={name}>
      <p className="text-xs font-medium text-muted-foreground">{t(`group.${name}`)}</p>
      {groupBlock ? (
        <p className="text-xs font-medium text-warning" data-mix-reason={groupBlock}>
          {t(`mix.${groupBlock}`)}
        </p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((person) => {
          const on = chosen.includes(person.id);
          const block = on ? "" : mixBlock(person, chosenPeople);
          return (
            <li key={person.id}>
              <Button
                type="button"
                variant="outline"
                aria-pressed={on}
                data-testid="office-talk-person"
                data-kind={person.kind}
                disabled={Boolean(block)}
                disabledReason={block ? t(`mix.${block}`) : undefined}
                onClick={() => onToggle(person)}
                className={cn(
                  "h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left",
                  on && "border-primary bg-primary/10",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{person.full_name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {name === "phone"
                      ? // MSE's own all-pages test phone has no role name: a site phone.
                        roleName(person.kind === "all_pages" ? "site_staff" : person.kind)
                      : person.kind === "consultant" && person.organization
                        ? `${t("kind.consultant")} · ${person.organization}`
                        : t(`kind.${person.kind}`)}
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
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
