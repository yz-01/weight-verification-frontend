"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Check, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { playAlertTone, wantsAlertSound } from "@/lib/alert-sound";
import { useDateFormat } from "@/lib/dates";
import { fieldNotificationHref } from "@/lib/field-notification";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
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
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const enabled =
    user?.features.some(
      (feature) =>
        feature === "notifications" || feature === "notification_center",
    ) ?? false;
  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    // Silent: the bell is mounted on every page, so a refusal here used to
    // paint "you do not have permission" over whatever the reader was
    // actually doing, about a count they never asked for. The badge already
    // says the count is unknown; that is the right place for it (F-224).
    queryFn: () => getUnreadNotificationCount({ silent: true }),
    enabled,
    refetchInterval: 30_000,
  });
  const listQuery = useQuery({
    queryKey: ["notifications", "toolbar", "unread"],
    queryFn: () =>
      getNotifications(
        {
          unread: "true",
          page_size: 5,
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

  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  // A failed count is not a count of zero. Rendering it as zero tells the
  // reader they have nothing waiting, and nobody goes looking for a
  // notification they have been told does not exist (F-222).
  const count = countQuery.data?.total ?? 0;
  const countFailed = countQuery.isError;
  const notificationHref =
    user?.is_field_staff
      ? "/field-staff"
      : user?.portal === "MSE_ADMIN"
        ? "/notifications/search"
        : "/notifications";

  if (!enabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative size-9 bg-card shadow-sm hover:border-primary/30 hover:bg-accent"
          title={t("notifications.title")}
          aria-label={
            countFailed
              ? t("notifications.countFailed")
              : t("notifications.unreadCount", { count })
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
                  : t("notifications.unreadCount", { count })}
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
                {t("notifications.noUnread")}
              </p>
            </div>
          ) : (
            listQuery.data?.results.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                onClick={async () => {
                  await read.mutateAsync(notification.id);
                  const rawHref = notification.data.href ?? notification.data.url;
                  const href = user?.is_field_staff
                    ? fieldNotificationHref(rawHref)
                    : typeof rawHref === "string" && rawHref.startsWith("/")
                      ? rawHref
                      : null;
                  if (href) {
                    setOpen(false);
                    router.push(href);
                  }
                }}
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {notification.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {notification.message}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {df.relative(notification.created_at)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
