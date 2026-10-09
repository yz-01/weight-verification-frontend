"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Check, ExternalLink, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createNoticeSounder,
  installAlertSoundUnlock,
  onAlertSoundUnlocked,
  playAlertTone,
  readAlertSoundMuted,
  wantsAlertSound,
  writeAlertSoundMuted,
} from "@/lib/alert-sound";
import { ActionCardStack } from "@/components/notifications/action-card-stack";
import {
  countSignature,
  useRefetchWhenChanged,
} from "@/components/notifications/bell-list-refresh";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import { fieldNotificationHref, openFieldHref } from "@/lib/field-notification";
import { officeNotificationHref } from "@/lib/office-notification";
import {
  confirmNotificationDone,
  fieldTodoCountQuery,
  getAllNotifications,
  getOutstandingNotificationCount,
} from "@/services/platform-ops.service";
import {
  enablePushNotifications,
  getPushConfig,
  isPushSupported,
} from "@/services/push-notification.service";

/** How often the bell's number is asked for. */
const BELL_COUNT_POLL_MS = 30_000;
const BELL_LIST_KEY = ["notifications", "toolbar", "outstanding"] as const;

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
  // The office's count is the whole pile, so the list can follow it.
  const listFollowsCount = !user?.is_field_staff;
  const countQuery = useQuery({
    // On the field phone the red dot is the to-do number (L1): the same
    // query, under the same key, as the My Tasks card on its home, so the
    // dot and the card are one answer. News still lists below without
    // counting. The office keeps the whole pile until its own home is
    // reworked (B01).
    ...(user?.is_field_staff
      ? fieldTodoCountQuery
      : {
          queryKey: ["notifications", "outstanding-count"],
          // Silent: the bell is mounted on every page, so a refusal here used
          // to paint "you do not have permission" over whatever the reader
          // was actually doing, about a count they never asked for. The badge
          // already says the count is unknown; that is the right place for it
          // (F-224).
          queryFn: () => getOutstandingNotificationCount({ silent: true }),
        }),
    enabled,
    refetchInterval: BELL_COUNT_POLL_MS,
  });
  const listQuery = useQuery({
    queryKey: BELL_LIST_KEY,
    queryFn: () =>
      getAllNotifications(
        {
          state: "PENDING",
          sort_by: "created_at",
          sort_order: "desc",
        },
        { silent: true },
      ),
    // Loaded with the page, as before: the pop-up action cards and the alert
    // tone read it. In the office it has no timer of its own - it follows
    // the count, which polls and counts every notice (below); it is refreshed
    // when the popover opens, and the live stream invalidates it as it does
    // every query on screen. The phone's count is its to-do number only (L1),
    // so a news notice that rings (a hazard it is told about) would not move
    // it: the phone's list keeps its own timer.
    enabled,
    refetchInterval: listFollowsCount ? false : BELL_COUNT_POLL_MS,
  });
  useRefetchWhenChanged(
    listFollowsCount ? countSignature(countQuery.data) : null,
    BELL_LIST_KEY,
  );
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
  // The tone (2026-10-09). In the office every new notice rings once - Lucas:
  // 「手机端的任何申请后台都需要收到通知 … 然后有 notification 和声音提示」.
  // On the phone only the notices that ask for it (a hazard) ring, as before.
  //
  // The list is re-read on the live stream's `notification.created` and when
  // the polled count moves, so both paths end here; the sounder remembers
  // each id and never rings for one twice, and the backlog already waiting
  // when the page opened is remembered, not rung.
  const isOffice = !user?.is_field_staff;
  // The person's own "sound off" choice, kept in this browser per account.
  const [muteVersion, setMuteVersion] = useState(0);
  const userId = user?.id;
  const muted = useMemo(
    () => (muteVersion >= 0 ? readAlertSoundMuted(userId) : false),
    [userId, muteVersion],
  );
  const userIdRef = useRef(userId);
  const isOfficeRef = useRef(isOffice);
  useEffect(() => {
    userIdRef.current = userId;
    isOfficeRef.current = isOffice;
  }, [userId, isOffice]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const sounder = useRef<ReturnType<typeof createNoticeSounder> | null>(null);
  sounder.current ??= createNoticeSounder({
    play: playAlertTone,
    rings: (row) => isOfficeRef.current || wantsAlertSound(row.data),
    muted: () => readAlertSoundMuted(userIdRef.current),
  });
  useEffect(() => {
    installAlertSoundUnlock();
    // The first click anywhere turns the sound on; the hint has done its job.
    return onAlertSoundUnlocked(() => setSoundBlocked(false));
  }, []);
  useEffect(() => {
    let current = true;
    void sounder.current?.observe(listQuery.data?.results).then((outcome) => {
      if (!current) return;
      // Blocked by the browser: the notice is on screen either way, and a
      // small hint by the bell offers the one click that allows the sound.
      if (outcome === "blocked") setSoundBlocked(true);
      if (outcome === "played") setSoundBlocked(false);
    });
    return () => {
      current = false;
    };
  }, [listQuery.data]);
  const toggleMuted = () => {
    const next = !muted;
    writeAlertSoundMuted(userId, next);
    setMuteVersion((version) => version + 1);
    if (!next) void playAlertTone();
  };

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
      ? fieldNotificationHref(notification.data.href ?? notification.data.url, notification.data)
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
    {isOffice && soundBlocked && !muted && (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-10 gap-1.5 border-primary/30 text-xs"
        title={t("notifications.sound.blockedHint")}
        onClick={async () => {
          // Inside the click, where the browser allows the sound to start.
          if (await playAlertTone()) setSoundBlocked(false);
        }}
      >
        <Volume2 className="size-4" />
        <span className="hidden sm:inline">{t("notifications.sound.enable")}</span>
      </Button>
    )}
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Opening shows the rows already held at once and reads them afresh
        // behind them, since the list no longer polls on its own.
        if (next) void queryClient.invalidateQueries({ queryKey: BELL_LIST_KEY, exact: true });
        // Closing the list forgets what was expanded, so reopening it looks
        // the way it did before rather than mid-read.
        if (!next) setExpanded(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative size-10 bg-card hover:border-primary/40 hover:bg-accent"
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
              className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-2xs font-semibold leading-none text-muted-foreground"
              title={t("notifications.countFailed")}
            >
              ?
            </span>
          ) : count > 0 ? (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-semibold leading-none text-destructive-foreground">
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
          {isOffice && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto size-8 shrink-0"
              aria-pressed={muted}
              title={muted ? t("notifications.sound.unmute") : t("notifications.sound.mute")}
              aria-label={muted ? t("notifications.sound.unmute") : t("notifications.sound.mute")}
              onClick={toggleMuted}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
          )}
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
                    openFieldHref(href, router.push);
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
                    className={`mt-1 text-xs leading-5 text-muted-foreground ${expanded === notification.id ? "block whitespace-pre-wrap" : "line-clamp-2"}`}
                  >
                    {notification.message}
                  </span>
                  <span className="mt-1 block text-2xs text-muted-foreground">
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
