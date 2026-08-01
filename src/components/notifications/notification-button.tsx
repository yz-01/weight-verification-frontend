"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { getUnreadNotificationCount } from "@/services/platform-ops.service";

export function NotificationButton() {
  const t = useTranslations();
  const { user } = useAuth();
  const enabled = user?.features.includes("notifications") ?? false;
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadNotificationCount,
    enabled,
    refetchInterval: 30_000,
  });

  if (!enabled) return null;
  const count = data?.total ?? 0;
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      title={t("notifications.title")}
    >
      <Link href="/notifications">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
        <span className="sr-only">
          {t("notifications.unreadCount", { count })}
        </span>
      </Link>
    </Button>
  );
}
