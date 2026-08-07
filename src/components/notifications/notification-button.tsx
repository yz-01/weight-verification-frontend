"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDateFormat } from "@/lib/dates";
import { getRefreshToken } from "@/lib/auth-token";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
} from "@/services/platform-ops.service";

export function NotificationButton() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const enabled = user?.features.includes("notifications") ?? false;
  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadNotificationCount,
    enabled,
    refetchInterval: 30_000,
  });
  const listQuery = useQuery({
    queryKey: ["notifications", "toolbar", "unread"],
    queryFn: () =>
      getNotifications({
        unread: "true",
        page_size: 5,
        sort_by: "created_at",
        sort_order: "desc",
      }),
    enabled,
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const count = countQuery.data?.total ?? 0;
  const notificationHref =
    user?.portal === "MSE_ADMIN" ? "/notifications/search" : "/notifications";

  useEffect(() => {
    if (!enabled || !user || count <= 0 || typeof window === "undefined")
      return;
    const sessionId = getRefreshToken()?.slice(-12) ?? "session";
    const key = `mse-notification-popup:${user.id}:${sessionId}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "shown");
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [count, enabled, user]);

  if (!enabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          title={t("notifications.title")}
          aria-label={t("notifications.unreadCount", { count })}
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{t("notifications.title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("notifications.unreadCount", { count })}
            </p>
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
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(listQuery.data?.results ?? []).length === 0 ? (
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
                onClick={() => read.mutate(notification.id)}
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
