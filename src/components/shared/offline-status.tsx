"use client";

import { CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOfflineSync } from "@/components/providers/offline-sync-provider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * The top bar's upload sign: shown only while something waits.
 *
 * Lucas, 2026-10-09: 「现场人员只需拍照、提交，不需要了解原图备份和同步操作」
 * and 「原图同步、重试及储存管理放在技术管理页面，不显示给现场人员」. So this is
 * a sign, not a control panel: the cloud icon with how many records wait, and
 * one sentence when tapped - 「已暂存，等待上传」, they go by themselves. No
 * retry, no discard, no originals, no storage figures: those are on the
 * technical page (`components/technical`). Originals are never counted here;
 * they back themselves up out of sight.
 */
export function OfflineStatus() {
  const t = useTranslations();
  const { isOnline, isSyncing, pendingCount, failedCount } = useOfflineSync();

  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  const label =
    pendingCount > 0
      ? t("offline.status.waiting", { count: pendingCount })
      : isSyncing
        ? t("offline.status.syncing")
        : t("offline.status.offlineNothing");
  const Icon = !isOnline ? CloudOff : isSyncing ? RefreshCw : CloudUpload;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-warning"
          aria-label={label}
          data-upload-indicator
        >
          <Icon className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {pendingCount > 0 && (
            <span
              className={`absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold leading-none ${
                failedCount > 0
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-warning text-warning-foreground"
              }`}
            >
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-1.5 p-3">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">
          {t(isOnline ? "offline.status.autoHelp" : "offline.status.offlineHelp")}
        </p>
        {failedCount > 0 && (
          <p className="text-xs font-medium leading-5 text-destructive">
            {t("offline.status.refusedHelp", { count: failedCount })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
