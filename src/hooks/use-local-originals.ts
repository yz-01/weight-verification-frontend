"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  getLocalOriginals,
  ORIGINALS_CHANGED,
  ORIGINALS_SYNC_REQUESTED,
  readAutoSync,
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

/** Pruned once per page load, not once per mounted badge. */
let prunedFor: string | null = null;

/**
 * 「连原图一起上传」 and the housekeeping, for the app that is open.
 *
 * With the switch on, originals follow their record as soon as it is
 * uploaded, and whatever is waiting goes when the app opens or comes back
 * online. With it off nothing is sent until the worker presses 「同步原图」.
 */
export function useOriginalAutoSync(ownerId: string | null | undefined) {
  useEffect(() => {
    if (!ownerId) return;
    if (prunedFor !== ownerId) {
      prunedFor = ownerId;
      void pruneAbandonedOriginals(ownerId);
    }
    const maybeSync = () => {
      if (!readAutoSync(ownerId)) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void syncOriginals(ownerId);
    };
    maybeSync();
    window.addEventListener(ORIGINALS_SYNC_REQUESTED, maybeSync);
    window.addEventListener("online", maybeSync);
    return () => {
      window.removeEventListener(ORIGINALS_SYNC_REQUESTED, maybeSync);
      window.removeEventListener("online", maybeSync);
    };
  }, [ownerId]);
}
