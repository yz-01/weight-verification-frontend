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
 */

import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, UsersRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { usePageProject } from "@/components/providers/current-project-provider";
import { FieldWrapper, ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getOfficeFieldChats, type OfficeFieldChat } from "@/services/field-conversations.service";

export function FieldChatsOffice() {
  const t = useTranslations("fieldChats");
  const df = useDateFormat();
  const params = useSearchParams();
  const [project, setProject] = usePageProject("", { all: "all" });
  const [picked, setPicked] = useState<string | null>(params.get("chat"));
  const chats = useQuery({
    queryKey: ["record-conversation", "office-field-chats", project || "all"],
    queryFn: () => getOfficeFieldChats(project && project !== "all" ? project : undefined),
  });
  const rows = chats.data?.results ?? [];
  const open = rows.find((row) => row.id === picked) ?? null;

  return (
    <div className="space-y-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <FieldWrapper label={t("project")} className="max-w-md">
        <ProjectPicker
          value={project}
          onValueChange={setProject}
          placeholder={t("project")}
          allowAll
          allLabel={t("allProjects")}
        />
      </FieldWrapper>
      <QueryFailedNote query={chats} what={t("title")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ul className="space-y-2" data-field-chats>
          {chats.isLoading ? (
            <li className="text-sm text-muted-foreground">{t("loading")}</li>
          ) : rows.length === 0 ? (
            <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id}>
                <ChatRow row={row} active={row.id === picked} onOpen={() => setPicked(row.id)} when={df.dateTime(row.last_at)} />
              </li>
            ))
          )}
        </ul>
        <div className="surface-panel min-h-64 rounded-xl p-4">
          {open ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {open.project_name} · {t("people", { names: open.people.map((person) => person.name).join("、") })}
              </div>
              <RecordConversationPanel
                key={open.id}
                kind="DIRECT"
                recordId={open.id}
                labels={{ title: open.title, empty: t("noMessages") }}
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
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{row.title}</span>
          <span className="shrink-0 text-2xs text-muted-foreground">{when}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{row.project_name}</span>
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
