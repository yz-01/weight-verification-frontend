"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { Button } from "@/components/ui/button";
import { useDateFormat } from "@/lib/dates";
import { fieldNotificationHref } from "@/lib/field-notification";
import {
  getNotifications,
  getOutstandingNotificationCount,
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
 */
export function FieldMyTasksCard() {
  const t = useTranslations();
  const df = useDateFormat();
  const router = useRouter();

  const counts = useQuery({
    queryKey: ["notifications", "outstanding-count"],
    queryFn: () => getOutstandingNotificationCount({ silent: true }),
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: ["notifications", "field-my-tasks"],
    queryFn: () =>
      getNotifications(
        {
          card: "ACTION",
          state: "PENDING",
          page_size: 5,
          sort_by: "created_at",
          sort_order: "desc",
        },
        { silent: true },
      ),
    refetchInterval: 60_000,
  });

  const total = counts.data?.action ?? 0;
  const rows = list.data?.results ?? [];

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
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
                : t("notifications.myTasks.waiting", { count: total })}
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
                    onClick={() => router.push(href)}
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

      {!counts.isError && total === 0 && (
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
          {t("notifications.myTasks.clear")}
        </p>
      )}
    </section>
  );
}
