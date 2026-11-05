"use client";

import {
  AlertTriangle,
  CloudOff,
  CloudUpload,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useOfflineSync } from "@/components/providers/offline-sync-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDateFormat } from "@/lib/dates";
import { wordRefusal } from "@/lib/queue-refusal";
import {
  discardOfflineJob,
  getOfflineQueueEntries,
  OFFLINE_QUEUE_CHANGED,
  type OfflineQueueEntry,
  retryOfflineJob,
  waitingReason,
} from "@/services/offline-sync.service";

/**
 * The top bar's upload sign: shown only while something waits.
 *
 * Lucas, 2026-10-09: 「现场人员只需拍照、提交，不需要了解原图备份和同步操作」
 * and 「原图同步、重试及储存管理放在技术管理页面，不显示给现场人员」. So this is
 * a sign, not a control panel: the cloud icon with how many records wait, and
 * one sentence when tapped - 「已暂存，等待上传」, they go by themselves.
 * Originals are never counted here; they back themselves up out of sight.
 *
 * One exception (JB98, 客户 11-05 事项 1: 「有网络了它还是不会提交」): a record
 * the server refused does not go by itself, and nobody on site can reach the
 * technical page. So a refused record is counted apart - 「上传失败 N 条」, not
 * in 「等待上传」 - and listed here with its reason in the worker's language,
 * with 「重试」 and 「删除这一条」 (asked first), for every kind of record.
 */
export function OfflineStatus() {
  const t = useTranslations();
  const { isOnline, isSyncing, pendingCount, failedCount } = useOfflineSync();
  // While 「删除这一条」 asks to confirm, its dialog sits outside the popover;
  // the popover stays open under it instead of closing (and taking the
  // dialog with it) at the first tap in the dialog.
  const [confirming, setConfirming] = useState(false);

  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  // pendingCount is every record on the phone; the refused ones are counted
  // on their own line.
  const waiting = Math.max(pendingCount - failedCount, 0);
  const label =
    waiting > 0
      ? t("offline.status.waiting", { count: waiting })
      : failedCount > 0
        ? t("offline.status.uploadFailed", { count: failedCount })
        : isSyncing
          ? t("offline.status.syncing")
          : t("offline.status.offlineNothing");
  // The number on the sign follows the same split (JB98): what waits, or -
  // when nothing waits - what failed, in red. A refused record is no longer
  // counted as waiting.
  const badge = waiting > 0 ? waiting : failedCount;
  const badgeFailed = waiting === 0 && failedCount > 0;
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
          {badge > 0 && (
            <span
              className={`absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold leading-none ${
                badgeFailed
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-warning text-warning-foreground"
              }`}
              data-upload-badge={badgeFailed ? "failed" : "waiting"}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          {/* Waiting and refused at once: the number is what waits, a red dot
              says something also failed. */}
          {waiting > 0 && failedCount > 0 && (
            <span
              className="absolute bottom-1 right-1 size-2 rounded-full bg-destructive"
              data-upload-failed-dot
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] space-y-1.5 p-3"
        onInteractOutside={(event) => {
          if (confirming) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          if (confirming) event.preventDefault();
        }}
      >
        <p className="text-sm font-semibold">{label}</p>
        {(waiting > 0 || failedCount === 0) && (
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              isOnline
                ? "offline.status.autoHelp"
                : "offline.status.offlineHelp",
            )}
          </p>
        )}
        {waiting > 0 && <WaitingRecords count={waiting} />}
        {failedCount > 0 && (
          <RefusedRecords
            count={failedCount}
            showTitle={waiting > 0}
            onConfirmingChange={setConfirming}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The records still going by themselves, each with why it has not gone yet
 * and 「立即上传」 (JB106, 客户 11-05: 「上传失败必须显示原因，并提供重试功能」).
 * No delete here: a waiting record is kept until it goes (「必须保留原来的
 * 照片及记录，不可直接删除」).
 */
export function WaitingRecords({ count }: { count: number }) {
  const { user } = useAuth();
  const { refreshCount } = useOfflineSync();
  const [entries, setEntries] = useState<OfflineQueueEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await getOfflineQueueEntries(user.id);
      setEntries(rows.filter((row) => row.state !== "failed"));
    } catch {
      setEntries([]);
    }
  }, [user]);

  useEffect(() => {
    const reload = () => void load();
    reload();
    window.addEventListener(OFFLINE_QUEUE_CHANGED, reload);
    return () => window.removeEventListener(OFFLINE_QUEUE_CHANGED, reload);
  }, [load, count]);

  const upload = async (entry: OfflineQueueEntry) => {
    if (!user) return;
    setBusy(entry.id);
    try {
      await retryOfflineJob(user.id, entry.id);
    } catch {
      // Said on the record itself once the pass has kept why.
    } finally {
      setBusy(null);
      await refreshCount();
      await load();
    }
  };

  return (
    <WaitingRecordsView
      entries={entries}
      busy={busy}
      onUpload={(entry) => void upload(entry)}
    />
  );
}

/** What the popover shows of the waiting records, apart from the loading. */
export function WaitingRecordsView({
  entries,
  busy,
  onUpload,
}: {
  entries: OfflineQueueEntry[];
  busy: string | null;
  onUpload: (entry: OfflineQueueEntry) => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  if (entries.length === 0) return null;
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto pt-1" data-waiting-records>
      {entries.map((entry) => {
        const reason = waitingReason(entry.lastError, t);
        const uploading = busy === entry.id || entry.state === "syncing";
        return (
          <li
            key={entry.id}
            className="space-y-1.5 rounded-md border border-warning/30 bg-warning/5 p-2"
            data-waiting-record={entry.id}
          >
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CloudUpload className="size-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate">
                {t(`offline.kind.${entry.kind}`)}
                {entry.reference ? ` · ${entry.reference}` : ""}
              </span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {df.dateTime(entry.queuedAt)}
              </span>
            </p>
            <p className="text-xs leading-5 text-muted-foreground" data-waiting-reason>
              {uploading
                ? t("offline.waiting.uploading")
                : reason
                  ? t("offline.waiting.lastFailed", { reason, count: entry.attempts })
                  : t("offline.waiting.notTried")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              disabled={busy !== null || entry.state === "syncing"}
              disabledReason={t("offline.waiting.uploading")}
              onClick={() => onUpload(entry)}
              data-waiting-upload
            >
              <RefreshCw className={`size-4 ${uploading ? "animate-spin" : ""}`} />
              {t("offline.waiting.uploadNow")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** The records the server refused, each with its reason, 「重试」 and 「删除这一条」. */
export function RefusedRecords({
  count,
  showTitle,
  onConfirmingChange,
}: {
  count: number;
  showTitle: boolean;
  onConfirmingChange?: (confirming: boolean) => void;
}) {
  const { user } = useAuth();
  const { refreshCount } = useOfflineSync();
  const [entries, setEntries] = useState<OfflineQueueEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeletingState] = useState<OfflineQueueEntry | null>(null);
  const setDeleting = (entry: OfflineQueueEntry | null) => {
    setDeletingState(entry);
    onConfirmingChange?.(entry !== null);
  };

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await getOfflineQueueEntries(user.id);
      setEntries(rows.filter((row) => row.state === "failed"));
    } catch {
      setEntries([]);
    }
  }, [user]);

  useEffect(() => {
    const reload = () => void load();
    reload();
    window.addEventListener(OFFLINE_QUEUE_CHANGED, reload);
    return () => window.removeEventListener(OFFLINE_QUEUE_CHANGED, reload);
  }, [load, count]);

  const retry = async (entry: OfflineQueueEntry) => {
    if (!user) return;
    setBusy(entry.id);
    try {
      await retryOfflineJob(user.id, entry.id);
    } finally {
      setBusy(null);
      await refreshCount();
      await load();
    }
  };

  const remove = async (entry: OfflineQueueEntry) => {
    setBusy(entry.id);
    try {
      await discardOfflineJob(entry.id);
    } finally {
      setBusy(null);
      setDeleting(null);
      await refreshCount();
      await load();
    }
  };

  return (
    <RefusedRecordsView
      entries={entries}
      count={count}
      showTitle={showTitle}
      busy={busy}
      deleting={deleting}
      onRetry={(entry) => void retry(entry)}
      onAskDelete={setDeleting}
      onConfirmDelete={(entry) => void remove(entry)}
      onCancelDelete={() => setDeleting(null)}
    />
  );
}

/**
 * What the popover shows of the refused records. Apart from the loading and
 * the presses so the words - the reason, never 「Validation failed.」 - can be
 * checked on their own.
 */
export function RefusedRecordsView({
  entries,
  count,
  showTitle,
  busy,
  deleting,
  onRetry,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  entries: OfflineQueueEntry[];
  count: number;
  showTitle: boolean;
  busy: string | null;
  /** The record whose 「删除这一条」 is asking to confirm. */
  deleting: OfflineQueueEntry | null;
  onRetry: (entry: OfflineQueueEntry) => void;
  onAskDelete: (entry: OfflineQueueEntry) => void;
  onConfirmDelete: (entry: OfflineQueueEntry) => void;
  onCancelDelete: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  return (
    <div className="space-y-2" data-refused-records>
      {showTitle && (
        <p className="pt-1 text-sm font-semibold text-destructive">
          {t("offline.status.uploadFailed", { count })}
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {t("offline.status.refusedHelp")}
      </p>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2"
            data-refused-record={entry.id}
          >
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate">
                {t(`offline.kind.${entry.kind}`)}
                {entry.reference ? ` · ${entry.reference}` : ""}
              </span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {df.dateTime(entry.queuedAt)}
              </span>
            </p>
            <p
              className="text-xs leading-5 text-destructive"
              data-refused-reason
            >
              {entry.reason
                ? wordRefusal(entry.reason, t)
                : t("offline.refused.generic")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => onRetry(entry)}
                data-refused-retry
              >
                <RefreshCw
                  className={`size-4 ${busy === entry.id ? "animate-spin" : ""}`}
                />
                {t("offline.refused.retry")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={busy !== null}
                onClick={() => onAskDelete(entry)}
                data-refused-delete
              >
                <Trash2 className="size-4" />
                {t("offline.refused.delete")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) onCancelDelete();
          }}
          title={t("offline.refused.deleteTitle")}
          description={t("offline.refused.deleteHelp")}
          confirmLabel={t("offline.refused.delete")}
          isPending={busy !== null}
          onConfirm={() => onConfirmDelete(deleting)}
        />
      )}
    </div>
  );
}
