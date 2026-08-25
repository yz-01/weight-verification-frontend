"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, ChevronRight, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { DriverError, DriverLoading } from "@/components/driver/driver-shell";
import { Button } from "@/components/ui/button";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import {
  dismissNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/platform-ops.service";

export function DriverNotifications() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const realtimeKeys = useMemo(() => [["notifications"]], []);
  useOrderRealtime(realtimeKeys);
  const query = useQuery({
    queryKey: ["notifications", "driver"],
    queryFn: () =>
      getNotifications({ page_size: 50, sort_by: "created_at", sort_order: "desc" }),
    refetchInterval: 15_000,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refresh,
  });
  const dismiss = useMutation({ mutationFn: dismissNotification, onSuccess: refresh });

  if (query.isLoading) return <DriverLoading />;
  if (query.isError) return <DriverError onRetry={() => void query.refetch()} />;

  const rows = query.data?.results ?? [];
  const unread = rows.filter((row) => !row.is_read).length;
  const open = async (notification: NotificationRow) => {
    if (!notification.is_read) await read.mutateAsync(notification.id);
    const taskId =
      typeof notification.data.task_id === "string"
        ? notification.data.task_id
        : null;
    router.push(taskId ? `/driver/${taskId}` : "/driver/notifications");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("driver.notifications.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("driver.notifications.unread", { count: unread })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={unread === 0 || readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          <CheckCheck className="h-4 w-4" />
          {t("notifications.markAllRead")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-5 py-12 text-center">
          <Check className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("driver.notifications.empty")}
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {rows.map((notification) => (
            <article
              key={notification.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4"
            >
              <span
                className={`mt-1 grid h-8 w-8 place-items-center rounded-full ${
                  notification.is_read
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary"
                }`}
              >
                <Bell className="h-4 w-4" />
              </span>
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => void open(notification)}
              >
                <span className="flex items-start gap-2">
                  <span
                    className={`min-w-0 flex-1 text-sm ${
                      notification.is_read ? "font-medium" : "font-semibold"
                    }`}
                  >
                    {notification.title}
                  </span>
                  {!notification.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </span>
                <span className="mt-1 block whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
                  {notification.message}
                </span>
                <NotificationTime value={notification.created_at} />
              </button>
              <div className="flex flex-col items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  title={t("driver.notifications.open")}
                  onClick={() => void open(notification)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive"
                  title={t("driver.notifications.remove")}
                  disabled={dismiss.isPending}
                  onClick={() => dismiss.mutate(notification.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationTime({ value }: { value: string }) {
  const df = useDateFormat();
  return (
    <span className="mt-2 block text-xs text-muted-foreground">
      {df.dateTime(value)}
    </span>
  );
}
