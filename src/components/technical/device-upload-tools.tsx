"use client";

/**
 * This device's uploads, for a technician (Lucas, 2026-10-09: 「原图同步、重试
 * 及储存管理放在技术管理页面，不显示给现场人员」).
 *
 * Everything here reads the browser storage of the device the page is open
 * on, for the account signed in on it: the records still waiting to upload,
 * the photo originals not yet backed up, and what the app keeps on the
 * device. A record or an original exists only on the phone that took it, so
 * the page says so and names the hidden phone address a technician opens on
 * the worker's own phone (`/field-staff/device`).
 *
 * The worker never needs any of it: records and originals go by themselves
 * (`OfflineSyncProvider`, `useAutomaticOriginals`). What is left here is
 * what the system will not do alone - resend a record the server refused,
 * resend an original it kept refusing, discard, and clear the photo cache -
 * each behind the same switch-to-arm rule as before (spec rule 8).
 */

import {
  AlertTriangle,
  HardDrive,
  ImageUp,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { PhoneStoragePanel } from "@/components/field-staff/phone-storage-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { useOfflineSync } from "@/components/providers/offline-sync-provider";
import { OriginalStatusText } from "@/components/shared/original-backup";
import { ArmRow } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLocalOriginals } from "@/hooks/use-local-originals";
import { useDateFormat } from "@/lib/dates";
import {
  megabytes,
  readStorageInfo,
  storageWarning,
  type LocalOriginalInfo,
  type StorageInfo,
} from "@/lib/original-photos";
import { originalsPace, readConnection } from "@/lib/upload-schedule";
import {
  discardOfflineJob,
  getOfflineQueueEntries,
  getRecentlySynced,
  OFFLINE_QUEUE_CHANGED,
  queueErrorKey,
  type OfflineQueueEntry,
  type OfflineQueueState,
  type SyncedQueueEntry,
} from "@/services/offline-sync.service";
import { syncOriginals, type OriginalSyncResult } from "@/services/original-sync.service";

/** The hidden phone address of these tools (not in any menu). */
export const DEVICE_TOOLS_PATH = "/field-staff/device";

/** How each state reads next to the action (AC-049). */
const STATE_CLASS: Record<OfflineQueueState, string> = {
  waiting: "text-muted-foreground",
  syncing: "text-primary",
  retrying: "text-warning",
  failed: "text-destructive",
  held: "text-warning",
};

export function DeviceUploadTools() {
  const t = useTranslations("technical.device");
  return (
    <div className="space-y-4" data-device-tools>
      <p className="rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm leading-6">
        {t("note", { path: DEVICE_TOOLS_PATH })}
      </p>
      <DeviceQueue />
      <DeviceOriginals />
      <DeviceStorage />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-panel space-y-3 rounded-xl p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** The records still on this device, with 立即重试 and the armed 「放弃」. */
function DeviceQueue() {
  const t = useTranslations();
  const df = useDateFormat();
  const { user } = useAuth();
  const { isOnline, isSyncing, pendingCount, failedCount, syncNow } = useOfflineSync();
  const [entries, setEntries] = useState<OfflineQueueEntry[]>([]);
  const [synced, setSynced] = useState<SyncedQueueEntry[]>([]);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!user) return;
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
    window.addEventListener(OFFLINE_QUEUE_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, load);
    };
  }, [user, pendingCount, isSyncing]);

  return (
    <Section title={t("technical.device.queueTitle")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <p>{t("technical.device.queueCount", { count: pendingCount })}</p>
          {failedCount > 0 && (
            <p className="text-xs font-medium text-destructive">
              {t("offline.status.failed", { count: failedCount })}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabledReason={
            !isOnline ? t("common.offline") : pendingCount === 0 ? t("common.nothingToSync") : undefined
          }
          disabled={!isOnline || isSyncing || pendingCount === 0}
          // A technician's press: also resend what the server refused, which
          // the automatic passes never do (A9).
          onClick={() => void syncNow({ includeRefused: true })}
          data-retry-records
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          {t("offline.queue.retry")}
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{t("technical.device.queueHelp")}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("offline.queue.empty")}</p>
      ) : (
        <div className="rounded-lg border">
          <QueueEntries
            entries={entries}
            armed={armed}
            onArmedChange={setArmed}
            onDiscard={(id) =>
              void discardOfflineJob(id).then(() =>
                setEntries((current) => current.filter((row) => row.id !== id)),
              )
            }
          />
        </div>
      )}
      {synced.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t("offline.queue.recent")}</p>
          <ul className="divide-y">
            {synced.map((entry) => (
              <li key={entry.id} className="py-1.5 text-sm">
                {t(`offline.kind.${entry.kind}`)}
                {entry.reference && (
                  <span className="ml-1.5 text-xs text-muted-foreground">{entry.reference}</span>
                )}
                <span className="ml-1.5 text-xs text-success">
                  {t("offline.state.synced")} · {df.dateTime(entry.syncedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/**
 * The queued actions, each with its 「放弃」 (四.6). Discarding deletes work
 * the server never received, so every discard button stays grey until the
 * switch above them is on (spec rule 8) - no dialog.
 */
export function QueueEntries({
  entries,
  armed,
  onArmedChange,
  onDiscard,
}: {
  entries: OfflineQueueEntry[];
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  onDiscard: (id: string) => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  /** The stored reason in words: no-answer reasons are stored as a code. */
  const reasonText = (lastError: string) => {
    const key = queueErrorKey(lastError);
    return key ? t(key) : lastError;
  };
  return (
    <>
      <ArmRow className="m-2 p-2">
        <label className="flex min-w-0 flex-1 items-start gap-2.5">
          <Switch
            tone="danger"
            size="sm"
            className="mt-0.5"
            checked={armed}
            onCheckedChange={onArmedChange}
            aria-label={t("offline.queue.armDiscard")}
            data-arm-discard
          />
          <span className="text-xs leading-5 text-muted-foreground">
            {t("offline.queue.armDiscardHelp")}
          </span>
        </label>
      </ArmRow>
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
              {(entry.state === "failed" || entry.state === "retrying") && (
                <p className={`mt-0.5 text-xs font-medium ${STATE_CLASS[entry.state]}`}>
                  {t("offline.queue.attemptFailed", { count: entry.attempts })}
                  {entry.lastError ? ` · ${reasonText(entry.lastError)}` : ""}
                </p>
              )}
              {entry.state === "failed" && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("offline.queue.needsAttentionHint")}
                </p>
              )}
              {entry.hint && <p className="mt-0.5 text-xs text-muted-foreground">{t(entry.hint)}</p>}
              {entry.state === "held" && (
                <p className="mt-0.5 text-xs text-muted-foreground">{t("offline.queue.heldHint")}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
              title={t("offline.queue.discard")}
              disabled={!armed}
              disabledReason={t("offline.queue.armFirst")}
              data-discard
              onClick={() => onDiscard(entry.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The message key for why the last attempt for these originals failed. */
function failureKey(rows: LocalOriginalInfo[]): string {
  const failed = rows.filter((row) => row.state === "failed");
  const code = failed[failed.length - 1]?.lastErrorCode ?? "";
  if (code === "network" || code === "timeout") return "originals.failedNetwork";
  if (code === "original_hash_mismatch") return "errors.api.original_hash_mismatch";
  if (code === "original_not_expected") return "errors.api.original_not_expected";
  return "originals.failedOther";
}

function SyncOutcome({ result, offline }: { result: OriginalSyncResult | null; offline: boolean }) {
  const t = useTranslations("originals");
  if (offline) return <p className="text-xs text-warning">{t("offline")}</p>;
  if (!result) return null;
  const parts = [
    result.backedUp ? t("result.backedUp", { count: result.backedUp }) : "",
    result.failed ? t("result.failed", { count: result.failed }) : "",
    result.notYet ? t("result.notYet", { count: result.notYet }) : "",
  ].filter(Boolean);
  return (
    <p className={`text-xs ${result.failed ? "text-destructive" : "text-muted-foreground"}`}>
      {parts.length ? parts.join(" · ") : t("result.nothing")}
    </p>
  );
}

/** The originals this device still holds for the signed-in account. */
function DeviceOriginals() {
  const t = useTranslations();
  const { user } = useAuth();
  const ownerId = user?.id;
  const { rows, summary, progress, readFailed } = useLocalOriginals(ownerId);
  const [result, setResult] = useState<OriginalSyncResult | null>(null);
  const [offline, setOffline] = useState(false);
  const gentle = originalsPace(readConnection()) === "gentle";

  const retry = async () => {
    if (!ownerId) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOffline(true);
      return;
    }
    setOffline(false);
    // Everything waiting, including what the automatic runs gave up on.
    setResult(await syncOriginals(ownerId));
  };

  return (
    <Section title={t("technical.device.originalsTitle")}>
      <p className="text-xs leading-5 text-muted-foreground">{t("technical.device.originalsHelp")}</p>
      {readFailed ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          {t("originals.readFailed")}
        </p>
      ) : summary.waiting === 0 && summary.captured === 0 ? (
        <p className="text-sm text-muted-foreground">{t("originals.nothingWaiting")}</p>
      ) : (
        <div className="space-y-1 text-sm">
          {summary.waiting > 0 && (
            <p>
              <OriginalStatusText status="ORIGINAL_PENDING" />{" "}
              {t("originals.waiting", { count: summary.waiting, mb: megabytes(summary.waitingBytes) })}
            </p>
          )}
          {summary.failed > 0 && (
            <p className="text-xs text-destructive">
              {t("originals.failed", { count: summary.failed })} · {t(failureKey(rows))}
            </p>
          )}
          {summary.captured > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("originals.capturedNote", { count: summary.captured })}
            </p>
          )}
        </div>
      )}
      {gentle && <p className="text-xs text-muted-foreground">{t("technical.device.gentle")}</p>}
      <Button
        size="sm"
        variant="outline"
        disabled={progress.running || summary.waiting === 0}
        disabledReason={progress.running ? undefined : summary.waiting === 0 ? t("originals.nothingWaiting") : undefined}
        onClick={() => void retry()}
        data-retry-originals
      >
        {progress.running ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
        {t("technical.device.retryOriginals")}
      </Button>
      {progress.running && (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <Loader2 className="size-3.5 animate-spin" />
          {t("originals.syncing", {
            done: progress.done,
            total: progress.total,
            mb: megabytes(progress.remainingBytes),
          })}
        </p>
      )}
      <SyncOutcome result={result} offline={offline} />
    </Section>
  );
}

/** What the app keeps on this device, the honest limits, and the cache cleanup. */
function DeviceStorage() {
  const t = useTranslations();
  const { user } = useAuth();
  const { summary } = useLocalOriginals(user?.id);
  const [storage, setStorage] = useState<StorageInfo>({ persisted: null, usage: null, quota: null });

  useEffect(() => {
    let cancelled = false;
    void readStorageInfo().then((info) => {
      if (!cancelled) setStorage(info);
    });
    return () => {
      cancelled = true;
    };
  }, [summary.heldBytes]);

  const warning = storageWarning(storage, summary.waitingBytes);
  return (
    <Section title={t("originals.storage.title")}>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <HardDrive className="size-3.5" />
          {t("originals.storage.held", { count: summary.waiting + summary.captured, mb: megabytes(summary.heldBytes) })}
        </p>
        {storage.usage != null && storage.quota ? (
          <p>
            {t("originals.storage.usage", { used: megabytes(storage.usage), quota: megabytes(storage.quota) })}
          </p>
        ) : (
          <p>{t("originals.storage.unknown")}</p>
        )}
        <p>
          {storage.persisted === true
            ? t("originals.storage.persisted")
            : storage.persisted === false
              ? t("originals.storage.notPersisted")
              : t("originals.storage.persistUnknown")}
        </p>
        {warning !== "none" && (
          <p role="alert" className="flex items-start gap-1.5 font-medium text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {t(warning === "full" ? "originals.storage.full" : "originals.storage.high")}
          </p>
        )}
      </div>
      <div className="space-y-1 text-xs leading-5 text-muted-foreground">
        <p>{t("originals.limit.local")}</p>
        <p>{t("originals.limit.verified")}</p>
        <p>{t("originals.limit.frame")}</p>
      </div>
      <PhoneStoragePanel defaultOpen />
    </Section>
  );
}
