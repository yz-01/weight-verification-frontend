"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Check, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { playAlertTone, wantsAlertSound } from "@/lib/alert-sound";
import { ActionCardStack } from "@/components/notifications/action-card-stack";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import { fieldNotificationHref } from "@/lib/field-notification";
import { officeNotificationHref } from "@/lib/office-notification";
import {
  confirmNotificationDone,
  getAllNotifications,
  getOutstandingNotificationCount,
} from "@/services/platform-ops.service";
import {
  enablePushNotifications,
  getPushConfig,
  isPushSupported,
} from "@/services/push-notification.service";

export function NotificationButton() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  /**
   * Which notification is showing its whole message (T-217).
   *
   * One at a time, and reset when the popover closes: a list where several
   * rows have grown is harder to scan than the clamped one it replaced.
   */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const enabled =
    user?.features.some(
      (feature) =>
        feature === "notifications" || feature === "notification_center",
    ) ?? false;
  const countQuery = useQuery({
    queryKey: ["notifications", "outstanding-count"],
    // Silent: the bell is mounted on every page, so a refusal here used to
    // paint "you do not have permission" over whatever the reader was
    // actually doing, about a count they never asked for. The badge already
    // says the count is unknown; that is the right place for it (F-224).
    queryFn: () => getOutstandingNotificationCount({ silent: true }),
    enabled,
    refetchInterval: 30_000,
  });
  const listQuery = useQuery({
    queryKey: ["notifications", "toolbar", "outstanding"],
    queryFn: () =>
      getAllNotifications(
        {
          state: "PENDING",
          sort_by: "created_at",
          sort_order: "desc",
        },
        { silent: true },
      ),
    enabled,
    refetchInterval: 30_000,
  });
  const pushConfig = useQuery({
    queryKey: ["notifications", "push-config"],
    queryFn: () => getPushConfig({ silent: true }),
    enabled: enabled && isPushSupported(),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!enabled || !isPushSupported()) return;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => setPushEnabled(false));
  }, [enabled]);
  // Sound the alert for notices that asked for one - today that is a material
  // budget threshold, which is money and worth interrupting somebody for.
  //
  // Only for notices that arrive while the page is open, and only once each:
  // the ids already seen are remembered so a refetch of the same five rows
  // every thirty seconds does not beep every thirty seconds.
  const soundedIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  useEffect(() => {
    const rows = listQuery.data?.results ?? [];
    if (firstLoad.current) {
      // Everything already waiting when the page opened is history, not news.
      // Beeping through a backlog on every page load is how people turn the
      // sound off, and then the next real one is silent too.
      rows.forEach((row) => soundedIds.current.add(row.id));
      if (listQuery.data) firstLoad.current = false;
      return;
    }
    const fresh = rows.filter(
      (row) => !soundedIds.current.has(row.id) && wantsAlertSound(row.data),
    );
    rows.forEach((row) => soundedIds.current.add(row.id));
    if (fresh.length > 0) {
      // Browsers refuse audio until the person has interacted with the page.
      // That refusal is correct, and the notice is visible either way, so a
      // silent outcome is not an error worth showing anybody.
      void playAlertTone();
    }
  }, [listQuery.data]);

  const confirm = useMutation({
    mutationFn: confirmNotificationDone,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  // A failed count is not a count of zero. Rendering it as zero tells the
  // reader they have nothing waiting, and nobody goes looking for a
  // notification they have been told does not exist (F-222).
  const count = countQuery.data?.total ?? 0;
  const todayCount = countQuery.data?.today ?? 0;
  const earlierCount = countQuery.data?.earlier ?? 0;
  const countFailed = countQuery.isError;
  const notificationHref =
    user?.is_field_staff
      ? "/field-staff?tab=home"
      : user?.portal === "MSE_ADMIN"
        ? "/notifications/search"
        : "/notifications";

  if (!enabled) return null;

  /** Where a notice leads: the phone's own screen, or the office path it names. */
  const destination = (notification: NotificationRow) => {
    return user?.is_field_staff
      ? fieldNotificationHref(notification.data.href ?? notification.data.url)
      : officeNotificationHref(notification.data);
  };

  return (
    <>
    {/* Pop-up task cards for the back office (#6, #30, #39; D-207). */}
    {!user?.is_field_staff && (
      <ActionCardStack
        rows={listQuery.data?.results ?? []}
        onOpen={(notification) => {
          const href = destination(notification);
          router.push(href ?? "/notifications/my-tasks");
        }}
      />
    )}
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Closing the list forgets what was expanded, so reopening it looks
        // the way it did before rather than mid-read.
        if (!next) setExpanded(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative size-9 bg-card shadow-sm hover:border-primary/30 hover:bg-accent"
          title={t("notifications.title")}
          aria-label={
            countFailed
              ? t("notifications.countFailed")
              : t("notifications.outstandingCount", { count })
          }
        >
          <Bell className="h-4 w-4" />
          {countFailed ? (
            <span
              className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold leading-none text-muted-foreground"
              title={t("notifications.countFailed")}
            >
              ?
            </span>
          ) : count > 0 ? (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(25rem,calc(100vw-1.5rem))] gap-0 overflow-hidden border-primary/15 p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b bg-muted/35 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Bell className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {t("notifications.title")}
              </p>
              <p
                className={
                  countFailed
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {countFailed
                  ? t("notifications.countFailed")
                  : t("notifications.outstandingSplit", {
                      today: todayCount,
                      earlier: earlierCount,
                    })}
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            <Link href={notificationHref}>
              <ExternalLink />
              {t("notifications.viewAll")}
            </Link>
          </Button>
          {pushConfig.data?.configured && !pushEnabled && (
            <Button
              size="sm"
              variant="outline"
              disabled={pushPending}
              onClick={async () => {
                setPushPending(true);
                try {
                  setPushEnabled(await enablePushNotifications());
                } finally {
                  setPushPending(false);
                }
              }}
            >
              <BellRing />
              {t("notifications.push.enable")}
            </Button>
          )}
        </div>
        {!pushEnabled && (
          // Without the push settings the "turn on phone alerts" offer cannot be shown.
          <QueryFailedNote query={pushConfig} what={t("notifications.what.pushConfig")} className="border-b px-4 py-2" />
        )}
        <div className="max-h-96 overflow-y-auto">
          {listQuery.isError ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-destructive">
                {t("notifications.listFailed")}
              </p>
            </div>
          ) : (listQuery.data?.results ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center">
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Check className="size-4" />
              </span>
              <p className="mt-3 text-sm font-medium">
                {t("notifications.nothingOutstanding")}
              </p>
            </div>
          ) : (
            listQuery.data?.results.map((notification) => (
              <div
                key={notification.id}
                className="border-b last:border-b-0"
              >
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 pb-1 pt-3 text-left transition-colors hover:bg-muted/40"
                onClick={() => {
                  /*
                   * Opening does nothing to the notice (D-206).
                   *
                   * This used to mark it read first, which removed it from the
                   * list and took one off the count - so glancing at something
                   * looked exactly like finishing it, and the customer's
                   * complaint (#2) was that things got forgotten that way.
                   * The only thing that settles a notice now is the confirm
                   * button below, or the record itself closing.
                   */
                  const href = destination(notification);
                  if (href) {
                    setOpen(false);
                    router.push(href);
                    return;
                  }
                  /*
                   * No destination: open it where it stands (T-217).
                   *
                   * The customer's words were 「每个通知也是可以点进去看细节的」.
                   * This branch used to do nothing at all beyond marking the
                   * row read, and the message above is clamped to two lines -
                   * so a notification with no screen behind it swallowed the
                   * tap and hid the rest of its own text. Expanding is the
                   * honest answer for the ones that genuinely have nowhere to
                   * go; giving them a destination is a per-notifier fix on the
                   * server, not something to guess at here.
                   */
                  setExpanded((current) =>
                    current === notification.id ? null : notification.id,
                  );
                }}
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {notification.title}
                  </span>
                  <span
                    className={`mt-1 block text-xs leading-5 text-muted-foreground ${expanded === notification.id ? "whitespace-pre-wrap" : "line-clamp-2"}`}
                  >
                    {notification.message}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {df.relative(notification.created_at)}
                  </span>
                </span>
              </button>
              {/*
                * The only thing that takes a notice off this list.
                *
                * Separate from the row on purpose: reading and finishing are
                * different acts, and the whole rework exists because the old
                * screen made one of them do the other's job. It also confirms
                * exactly this notice - D-207: 「只消失那一张卡片，不能连带清掉
                * 其他未完成卡片」.
                */}
              <div className="flex justify-end px-4 pb-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate(notification.id)}
                >
                  <Check />
                  {t("notifications.confirmDone")}
                </Button>
              </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}
