"use client";

import { CloudOff, CloudUpload, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useOfflineSync } from "@/components/providers/offline-sync-provider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDateFormat } from "@/lib/dates";
import {
  discardOfflineJob,
  getOfflineQueueEntries,
  getRecentlySynced,
  OFFLINE_QUEUE_CHANGED,
  type OfflineQueueEntry,
  type OfflineQueueState,
  type SyncedQueueEntry,
} from "@/services/offline-sync.service";

/** How each state reads next to the action (AC-049). */
const STATE_CLASS: Record<OfflineQueueState, string> = {
  waiting: "text-muted-foreground",
  syncing: "text-primary",
  failed: "text-destructive",
  held: "text-warning",
};

export function OfflineStatus() {
  const t = useTranslations();
  const df = useDateFormat();
  const { user } = useAuth();
  const { isOnline, isSyncing, pendingCount, failedCount, syncNow } =
    useOfflineSync();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<OfflineQueueEntry[]>([]);
  const [synced, setSynced] = useState<SyncedQueueEntry[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    const load = () => {
      setSynced(getRecentlySynced(user.id));
      void getOfflineQueueEntries(user.id)
        .then((rows) => {
          if (!cancelled) setEntries(rows);
        })
        .catch(() => {
          if (!cancelled) setEntries([]);
        });
    };
    load();
    // The queue announces each job it starts and finishes, so an open panel
    // follows 同步中 from row to row instead of only refreshing at the end.
    window.addEventListener(OFFLINE_QUEUE_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, load);
    };
  }, [open, user, pendingCount, isSyncing]);

  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  const label = !isOnline
    ? t("offline.status.offline", { count: pendingCount })
    : isSyncing
      ? t("offline.status.syncing")
      : t("offline.status.pending", { count: pendingCount });
  const Icon = !isOnline ? CloudOff : isSyncing ? RefreshCw : CloudUpload;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-warning"
          aria-label={label}
        >
          <Icon className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {pendingCount > 0 && (
            <span
              className={`absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
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
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">{label}</p>
            {failedCount > 0 && (
              <p className="text-xs font-medium text-destructive">
                {t("offline.status.failed", { count: failedCount })}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-3"
            disabledReason={
              !isOnline
                ? t("common.offline")
                : pendingCount === 0
                  ? t("common.nothingToSync")
                  : undefined
            }
            disabled={!isOnline || isSyncing || pendingCount === 0}
            onClick={() => void syncNow()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
            />
            {t("offline.queue.retry")}
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {t("offline.queue.empty")}
            </p>
          ) : (
            <ul className="divide-y">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t(`offline.kind.${entry.kind}`)}
                      {entry.reference && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {entry.reference}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className={`font-medium ${STATE_CLASS[entry.state]}`}>
                        {t(`offline.state.${entry.state}`)}
                      </span>
                      {" · "}
                      {df.dateTime(entry.queuedAt)}
                    </p>
                    {entry.state === "failed" && (
                      <p
                        className="mt-0.5 text-xs font-medium text-destructive"
                        title={entry.lastError}
                      >
                        {t("offline.queue.attemptFailed", {
                          count: entry.attempts,
                        })}
                        {entry.lastError ? ` · ${entry.lastError}` : ""}
                      </p>
                    )}
                    {entry.hint && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t(entry.hint)}
                      </p>
                    )}
                    {entry.state === "held" && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("offline.queue.heldHint")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
                    title={t("offline.queue.discard")}
                    onClick={() =>
                      void discardOfflineJob(entry.id).then(() =>
                        setEntries((current) =>
                          current.filter((row) => row.id !== entry.id),
                        ),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {synced.length > 0 && (
            <div className="border-t">
              <p className="px-3 pt-2.5 text-xs font-semibold text-muted-foreground">
                {t("offline.queue.recent")}
              </p>
              <ul className="divide-y">
                {synced.map((entry) => (
                  <li key={entry.id} className="px-3 py-2">
                    <p className="truncate text-sm">
                      {t(`offline.kind.${entry.kind}`)}
                      {entry.reference && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {entry.reference}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-success">
                        {t("offline.state.synced")}
                      </span>
                      {" · "}
                      {df.dateTime(entry.syncedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
