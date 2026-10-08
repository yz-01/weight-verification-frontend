"use client";

/**
 * The worker's view of photo originals (H5 三, WP1).
 *
 * The client's words: 「原图同步状态必须明确显示：应用照片已上传 / 原图待同步 /
 * 原图已备份 / 同步失败」, 「必须提供可操作的『同步原图』入口」, and 「明确提示
 * 流量及备份状态」. Three places carry the 「同步原图」 button: one record
 * (`RecordOriginalBackup`), 「我提交过的」 (`OriginalBackupBanner`) and the
 * offline / sync panel (`OriginalBackupPanel`, everything waiting).
 *
 * What is shown is the server's word: 「原图已备份」 appears only when the
 * server has verified the bytes. The phone adds only what it alone knows -
 * that its own last attempt failed, or that it no longer holds a file.
 */

import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  HardDrive,
  ImageUp,
  Loader2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLocalOriginals } from "@/hooks/use-local-originals";
import type { OriginalBackupSummary, OriginalStatus } from "@/interfaces/evidence";
import {
  megabytes,
  readAutoSync,
  readStorageInfo,
  requestPersistentStorage,
  shownStatus,
  storageWarning,
  writeAutoSync,
  type LocalOriginalInfo,
  type StorageInfo,
} from "@/lib/original-photos";
import { syncOriginals, type OriginalSyncResult } from "@/services/original-sync.service";

const STATUS_STYLE: Record<OriginalStatus, { icon: typeof CheckCircle2; className: string }> = {
  APPLICATION_UPLOADED: { icon: CloudUpload, className: "text-muted-foreground" },
  ORIGINAL_PENDING: { icon: ImageUp, className: "text-warning" },
  ORIGINAL_BACKED_UP: { icon: CheckCircle2, className: "text-success" },
  ORIGINAL_FAILED: { icon: XCircle, className: "text-destructive" },
};

/** One of the four states, worded and coloured. */
export function OriginalStatusText({ status, className = "" }: { status: OriginalStatus; className?: string }) {
  const t = useTranslations("originals");
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${style.className} ${className}`}>
      <Icon className="size-3.5 shrink-0" />
      {t(`status.${status}`)}
    </span>
  );
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Press 「同步原图」: all waiting originals, or only `ids`. */
function useSyncAction(ownerId: string | undefined) {
  const [result, setResult] = useState<OriginalSyncResult | null>(null);
  const [offline, setOffline] = useState(false);
  const run = async (ids?: string[]) => {
    if (!ownerId) return;
    if (isOffline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    setResult(await syncOriginals(ownerId, ids));
  };
  return { result, offline, run };
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

/** The message key for why the last attempt for these originals failed. */
function failureKey(rows: LocalOriginalInfo[]): string {
  const failed = rows.filter((row) => row.state === "failed");
  const code = failed[failed.length - 1]?.lastErrorCode ?? "";
  if (code === "network" || code === "timeout") return "originals.failedNetwork";
  if (code === "original_hash_mismatch") return "errors.api.original_hash_mismatch";
  if (code === "original_not_expected") return "errors.api.original_not_expected";
  return "originals.failedOther";
}

/** The progress line while a run is going. */
function Progress({ done, total, remainingBytes }: { done: number; total: number; remainingBytes: number }) {
  const t = useTranslations("originals");
  return (
    <p className="flex items-center gap-1.5 text-xs text-primary">
      <Loader2 className="size-3.5 animate-spin" />
      {t("syncing", { done, total, mb: megabytes(remainingBytes) })}
    </p>
  );
}

/**
 * Everything waiting on this phone, the switch, and the honest limits.
 *
 * The phone's 「设置 / 离线状态」 place: inside the offline / sync panel of
 * the header, which every phone screen carries.
 */
export function OriginalBackupPanel() {
  const t = useTranslations();
  const { user } = useAuth();
  const ownerId = user?.id;
  const { rows, summary, progress, readFailed } = useLocalOriginals(ownerId);
  const action = useSyncAction(ownerId);
  const [auto, setAuto] = useState(() => (ownerId ? readAutoSync(ownerId) : false));
  const [storage, setStorage] = useState<StorageInfo>({ persisted: null, usage: null, quota: null });
  const hasOriginals = rows.length > 0;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Asked when there is something to protect; the answer is shown and
      // the design assumes it can be no (三.重要).
      if (hasOriginals) await requestPersistentStorage();
      const info = await readStorageInfo();
      if (!cancelled) setStorage(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasOriginals, summary.heldBytes]);

  if (!ownerId) return null;
  const warning = storageWarning(storage, summary.waitingBytes);

  return (
    <section className="space-y-2.5 px-3 py-3" aria-labelledby="original-backup-title">
      <p id="original-backup-title" className="flex items-center gap-1.5 text-sm font-semibold">
        <ImageUp className="size-4 text-primary" />
        {t("originals.title")}
      </p>

      {readFailed ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          {t("originals.readFailed")}
        </p>
      ) : summary.waiting === 0 && summary.captured === 0 ? (
        <p className="text-xs text-muted-foreground">{t("originals.nothingWaiting")}</p>
      ) : (
        <div className="space-y-1">
          {summary.waiting > 0 && (
            <p className="text-sm">
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

      {summary.waiting > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("originals.trafficNote", { mb: megabytes(summary.waitingBytes) })}
        </p>
      )}

      <Button
        size="sm"
        className="w-full"
        disabled={progress.running || summary.waiting === 0}
        disabledReason={
          progress.running ? undefined : summary.waiting === 0 ? t("originals.nothingWaiting") : undefined
        }
        onClick={() => void action.run()}
      >
        {progress.running ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
        {t("originals.sync")}
      </Button>
      {progress.running && <Progress {...progress} />}
      <SyncOutcome result={action.result} offline={action.offline} />

      <label className="flex items-start justify-between gap-3 rounded-md border px-2.5 py-2">
        <span className="text-xs">
          <span className="block text-sm font-medium">{t("originals.autoLabel")}</span>
          <span className="block text-muted-foreground">{t("originals.autoHelp")}</span>
        </span>
        <Switch
          checked={auto}
          aria-label={t("originals.autoLabel")}
          onCheckedChange={(next) => {
            setAuto(next);
            writeAutoSync(ownerId, next);
            if (next && summary.waiting > 0) void action.run();
          }}
        />
      </label>

      <div className="space-y-1 rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <HardDrive className="size-3.5" />
          {t("originals.storage.title")}
        </p>
        <p>{t("originals.storage.held", { count: rows.length, mb: megabytes(summary.heldBytes) })}</p>
        {storage.usage != null && storage.quota ? (
          <p>
            {t("originals.storage.usage", {
              used: megabytes(storage.usage),
              quota: megabytes(storage.quota),
            })}
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
    </section>
  );
}

/**
 * One line above 「我提交过的」: how many originals wait, and the button.
 * Nothing at all when nothing waits, so the list stays as simple as it was.
 */
export function OriginalBackupBanner() {
  const t = useTranslations();
  const { user } = useAuth();
  const ownerId = user?.id;
  const { rows, summary, progress } = useLocalOriginals(ownerId);
  const action = useSyncAction(ownerId);
  if (!ownerId || (summary.waiting === 0 && !progress.running && !action.result && !action.offline)) {
    return null;
  }
  return (
    <div
      className={`space-y-1.5 rounded-xl border px-3 py-2.5 ${summary.failed ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"}`}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm">
          {summary.waiting > 0
            ? t("originals.waiting", { count: summary.waiting, mb: megabytes(summary.waitingBytes) })
            : t("originals.nothingWaiting")}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={progress.running || summary.waiting === 0}
          disabledReason={
            progress.running ? undefined : summary.waiting === 0 ? t("originals.nothingWaiting") : undefined
          }
          onClick={() => void action.run()}
        >
          {progress.running ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
          {t("originals.sync")}
        </Button>
      </div>
      {summary.failed > 0 && (
        <p className="text-xs text-destructive">
          {t("originals.failed", { count: summary.failed })} · {t(failureKey(rows))}
        </p>
      )}
      {summary.waiting > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("originals.trafficNote", { mb: megabytes(summary.waitingBytes) })} {t("originals.limit.soon")}
        </p>
      )}
      {progress.running && <Progress {...progress} />}
      <SyncOutcome result={action.result} offline={action.offline} />
    </div>
  );
}

/** A history row's state: only for a row that has photographs. */
export function RowOriginalStatus({
  summary,
  local,
  photoCount,
}: {
  summary?: OriginalBackupSummary;
  local: LocalOriginalInfo[];
  photoCount?: number;
}) {
  if (!summary || !photoCount) return null;
  return <OriginalStatusText status={shownStatus(summary, local).status} />;
}

/**
 * One opened record: its state, what this phone holds of it, and the
 * per-record 「同步原图」.
 */
export function RecordOriginalBackup({
  summary,
  onSynced,
}: {
  summary?: OriginalBackupSummary;
  onSynced?: () => void;
}) {
  const t = useTranslations();
  const { user } = useAuth();
  const ownerId = user?.id;
  const { rows, progress } = useLocalOriginals(ownerId);
  const action = useSyncAction(ownerId);
  if (!summary || !ownerId) return null;
  const shown = shownStatus(summary, rows);
  // A run in progress (this record's or everything's): the press joins it.
  const busy = progress.running;
  const heldBytes = shown.heldHere.reduce((sum, row) => sum + row.size, 0);

  return (
    <div className="space-y-1.5 rounded-lg border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{t("originals.record.title")}</span>
        <OriginalStatusText status={shown.status} />
        {summary.expected > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("originals.record.counts", { backedUp: summary.backed_up, expected: summary.expected })}
          </span>
        )}
      </div>
      {summary.expected === 0 ? (
        <p className="text-xs text-muted-foreground">{t("originals.record.noOriginal")}</p>
      ) : shown.status === "ORIGINAL_BACKED_UP" ? (
        <p className="text-xs text-muted-foreground">{t("originals.record.allBackedUp")}</p>
      ) : (
        <>
          {shown.heldHere.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("originals.record.heldHere", { count: shown.heldHere.length, mb: megabytes(heldBytes) })}
            </p>
          )}
          {shown.status === "ORIGINAL_FAILED" && shown.heldHere.length > 0 && (
            <p className="text-xs text-destructive">{t(failureKey(shown.heldHere))}</p>
          )}
          {shown.missingHere > 0 && (
            <p className="text-xs text-warning">{t("originals.record.missingHere", { count: shown.missingHere })}</p>
          )}
          {shown.heldHere.length > 0 && (
            <Button
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() =>
                void action.run(shown.heldHere.map((row) => row.id)).then(() => onSynced?.())
              }
            >
              {progress.running ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
              {t("originals.record.sync")}
            </Button>
          )}
          {progress.running && <Progress {...progress} />}
          <SyncOutcome result={action.result} offline={action.offline} />
        </>
      )}
    </div>
  );
}
