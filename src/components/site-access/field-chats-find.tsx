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
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, MessageSquarePlus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useCurrentProject } from "@/components/providers/current-project-provider";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getOfficeChatPeople,
  getOfficeChatProjects,
  OFFICE_CHAT_PROJECTS_KEY,
  startOfficeConversation,
  type OfficeChatPerson,
} from "@/services/field-conversations.service";

/** The office list's queries: refreshed when a conversation starts. */
export const OFFICE_FIELD_CHATS_KEY = ["record-conversation", "office-field-chats"] as const;

export type PersonGroup = "phone" | "office" | "head_office";

/** Which group of the list a person is in, in the list's order. */
export function personGroup(person: Pick<OfficeChatPerson, "kind">): PersonGroup {
  return person.kind === "office" || person.kind === "head_office" ? person.kind : "phone";
}

/**
 * Why `person` cannot join the people already chosen, or `""` (客户 11-10
 * 第七批 第 1 点: the phone never reaches head office). The server refuses
 * the mix as well; this says so before anybody presses start.
 */
export function mixBlock(
  person: Pick<OfficeChatPerson, "kind">,
  chosen: readonly Pick<OfficeChatPerson, "kind">[],
): "" | "phoneChosen" | "headOfficeChosen" {
  const group = personGroup(person);
  if (group === "head_office" && chosen.some((other) => personGroup(other) === "phone")) return "phoneChosen";
  if (group === "phone" && chosen.some((other) => personGroup(other) === "head_office")) return "headOfficeChosen";
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
  });
  const toggle = (person: OfficeChatPerson) =>
    setChosen((current) =>
      current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id],
    );

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
      <div className="flex min-w-0 items-center gap-3 border-b pb-3">
        <Button size="icon" variant="outline" title={t("back")} aria-label={t("back")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
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
            {search.trim() ? t("noPeople") : t("noPeopleOnProject")}
          </p>
        ) : (
          <div className="space-y-4">
            {group("phone")}
            {group("office")}
            {group("head_office")}
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
      {start.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("startFailed")}
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
  const groupBlock = rows.some((person) => chosen.includes(person.id))
    ? ""
    : mixBlock(rows[0], chosenPeople);
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
