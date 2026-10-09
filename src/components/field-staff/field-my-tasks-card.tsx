"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { Button } from "@/components/ui/button";
import { useDateFormat } from "@/lib/dates";
import { fieldNotificationHref, openFieldHref } from "@/lib/field-notification";
import {
  fieldTodoCountQuery,
  getAllNotifications,
} from "@/services/platform-ops.service";

/**
 * 我的待办, on the field home page (T-287 / D-226).
 *
 * Deliberately **not** a tab in the bottom bar. The customer was explicit:
 * 「【我的待办】不放底部导航，放首页上方以卡片显示未完成数量和内容」. It sits
 * above everything else on the home panel because it is the only block that
 * says what has to happen next; the task list below it says what the office
 * has handed over, which is not the same thing - a returned record or an
 * assigned rectification never appears there.
 *
 * It shows only `card=ACTION`: things this person has to do. News (a task
 * accepted, a collection time confirmed) belongs in the bell, not here, or
 * the count stops meaning "work left".
 *
 * Silent on failure by design. This renders above the whole home page, and a
 * refusal here used to paint a permission toast over whatever a person on
 * site was doing (F-224). A count that could not be loaded says so in the
 * card and leaves the rest of the page alone.
 *
 * The only 「My tasks」 on the home (L1). The task list used to sit under it
 * with its own title and its own count, and the two disagreed - 「0 waiting
 * on you」 over 「1 active task」, with the bell saying a third thing. D04
 * asks for one: 统一 My Tasks, 手机首页上方显示待办. So the number, the bell's
 * red dot and the rows below are one source - the notices asking this worker
 * to act, which the server closes when the work leaves their hands - and a
 * task is opened from its row, on the task screen that has its controls.
 *
 * Every row, not the first five: the card says how many are waiting, and a
 * count above a list that stops short of it is the mismatch again.
 */
export function FieldMyTasksCard() {
  const t = useTranslations();
  const df = useDateFormat();
  const router = useRouter();

  // Same key and interval as the bell's red dot on this portal, so the two
  // are one answer.
  const counts = useQuery({ ...fieldTodoCountQuery, refetchInterval: 30_000 });
  const list = useQuery({
    queryKey: ["notifications", "field-my-tasks"],
    queryFn: () =>
      getAllNotifications(
        {
          card: "ACTION",
          state: "PENDING",
          sort_by: "created_at",
          sort_order: "desc",
        },
        { silent: true },
      ),
    refetchInterval: 30_000,
  });

  const total = counts.data?.total ?? 0;
  // Not a zero until the server has said so. Before the count arrives the
  // card used to read 「0 waiting on you · Nothing is waiting on you」 and
  // then change its mind - the number disagreeing with itself, which is the
  // complaint L1 is about (and F-222's rule for the bell).
  const counted = counts.data !== undefined;
  const rows = list.data?.results ?? [];

  return (
    <section className="surface-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <ClipboardList className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {t("notifications.myTasks.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {counts.isError
                ? t("notifications.countFailed")
                : counted
                  ? t("notifications.myTasks.waiting", { count: total })
                  : t("common.loading")}
            </p>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="mt-3 divide-y border-t">
          {rows.map((row) => {
            const rawHref = row.data.href ?? row.data.url;
            const href = fieldNotificationHref(rawHref, row.data);
            const body = (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {row.title}
                </span>
                {/*
                  What it is about. Every assigned task has the same title,
                  「New site task assigned」, and the task's own name is in
                  the message - so without this line the card lists the same
                  words once per task and says nothing about which (L1).
                */}
                {row.message && (
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {row.message}
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {df.relative(row.created_at)}
                </span>
              </span>
            );
            /*
             * A row with nowhere to go is plain text, not a greyed-out button.
             *
             * Disabling it would be a control that looks pressable and says
             * nothing about why it is not; the row's job here is to say what
             * is waiting, and it still does that. Giving the notice a
             * destination is a per-notifier fix on the server (T-217), not
             * something this card can invent.
             */
            return (
              <li key={row.id}>
                {href ? (
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal px-0 py-3 text-left"
                    onClick={() => openFieldHref(href, router.push)}
                  >
                    {body}
                  </Button>
                ) : (
                  <div className="flex px-0 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <FieldLoadNote className="mt-3" query={list} what={t("fieldStaffPwa.what.myTasks")} />

      {counted && total === 0 && (
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
          {t("notifications.myTasks.clear")}
        </p>
      )}

      {/*
        The whole task list, one tap away rather than on the home. A link and
        not a second count: if a company has switched its system notices off,
        an assigned task sends no notice, and this is still the way to it.
      */}
      <Button
        variant="outline"
        className="mt-3 w-full"
        onClick={() => openFieldHref("/field-staff?tab=tasks", router.push)}
      >
        {t("notifications.myTasks.allSiteTasks")}
      </Button>
    </section>
  );
}
