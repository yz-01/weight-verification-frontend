"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  getLocalOriginals,
  ORIGINALS_CHANGED,
  ORIGINALS_SYNC_REQUESTED,
  summariseLocal,
  type LocalOriginalInfo,
} from "@/lib/original-photos";
import {
  originalSyncProgress,
  pruneAbandonedOriginals,
  subscribeOriginalSync,
  syncOriginals,
  type OriginalSyncProgress,
} from "@/services/original-sync.service";
import { autoSendable, originalsPace, PACE, readConnection, retryDelayMs } from "@/lib/upload-schedule";

const IDLE: OriginalSyncProgress = { running: false, done: 0, total: 0, remainingBytes: 0 };
const idle = () => IDLE;

/**
 * This person's kept originals on this phone, kept current (H5 三, WP1).
 *
 * Read straight from IndexedDB and re-read whenever they change. `readFailed`
 * is true when this browser will not let them be read at all - a private
 * window, or storage the system took away - which the screen says rather
 * than showing zero.
 */
export function useLocalOriginals(ownerId: string | null | undefined) {
  const [rows, setRows] = useState<LocalOriginalInfo[]>([]);
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    const load = () => {
      getLocalOriginals(ownerId)
        .then((next) => {
          if (cancelled) return;
          setRows(next);
          setReadFailed(false);
        })
        .catch(() => {
          if (!cancelled) setReadFailed(true);
        });
    };
    load();
    window.addEventListener(ORIGINALS_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ORIGINALS_CHANGED, load);
    };
  }, [ownerId]);

  const progress = useSyncExternalStore(subscribeOriginalSync, originalSyncProgress, idle);
  const shown = useMemo(() => (ownerId ? rows : []), [ownerId, rows]);
  const summary = useMemo(() => summariseLocal(shown), [shown]);
  return { rows: shown, summary, progress, readFailed };
}

/** Pruned once per page load, not once per mounted hook. */
let prunedFor: string | null = null;

/**
 * Originals back themselves up (Lucas, 2026-10-09: 「原图备份由系统自动完成，
 * 无需人工开关」). Mounted once, by the offline-sync provider, for whoever is
 * signed in on this device.
 *
 * A run starts when the app opens, when a record carrying originals is
 * accepted (`ORIGINALS_SYNC_REQUESTED`), when the signal comes back and when
 * the app is brought to the front. Records always go first: the run waits
 * while any is still on the phone. On a slow or metered connection
 * (`originalsPace`) it starts later and pauses between originals. While
 * something is left to send it tries again on a backing-off timer
 * (`retryDelayMs`), so a bad hour on site never needs a press.
 */
export function useAutomaticOriginals(ownerId: string | null | undefined) {
  useEffect(() => {
    if (!ownerId) return;
    if (prunedFor !== ownerId) {
      prunedFor = ownerId;
      void pruneAbandonedOriginals(ownerId);
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const later = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void runNow();
      }, ms);
    };

    const runNow = async () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const pace = PACE[originalsPace(readConnection())];
      const result = await syncOriginals(ownerId, undefined, { automatic: true, gapMs: pace.gapMs });
      if (cancelled) return;
      const left = (await getLocalOriginals(ownerId).catch(() => [])).filter(autoSendable).length;
      // Shots whose record is not on the server yet (`notYet`) are not a
      // reason to keep asking: the record's upload starts the next run.
      if (result.failed > 0 || left > 0) {
        failures = result.backedUp > 0 ? 0 : failures + 1;
        later(retryDelayMs(failures));
      } else {
        failures = 0;
      }
    };

    const start = () => {
      const pace = PACE[originalsPace(readConnection())];
      if (pace.startDelayMs > 0) later(pace.startDelayMs);
      else void runNow();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") start();
    };

    start();
    window.addEventListener(ORIGINALS_SYNC_REQUESTED, start);
    window.addEventListener("online", start);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(ORIGINALS_SYNC_REQUESTED, start);
      window.removeEventListener("online", start);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ownerId]);
}
