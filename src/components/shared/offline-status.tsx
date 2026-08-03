"use client";

import { CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOfflineSync } from "@/components/providers/offline-sync-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function OfflineStatus() {
  const t = useTranslations();
  const { isOnline, isSyncing, pendingCount, syncNow } = useOfflineSync();

  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  const label = !isOnline
    ? t("offline.status.offline", { count: pendingCount })
    : isSyncing
      ? t("offline.status.syncing")
      : t("offline.status.pending", { count: pendingCount });
  const Icon = !isOnline ? CloudOff : isSyncing ? RefreshCw : CloudUpload;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-warning"
          aria-label={label}
          disabled={!isOnline || isSyncing}
          onClick={() => void syncNow()}
        >
          <Icon className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {pendingCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-warning-foreground">
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
