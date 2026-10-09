"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { OFFLINE_SYNC_REQUESTED } from "@/components/providers/service-worker-registration";
import { useAutomaticOriginals } from "@/hooks/use-local-originals";
import { refreshChanged } from "@/lib/live-refresh";
import { clearDriverSnapshots, clearRecyclerSnapshots } from "@/lib/offline-db";
import { ORIGINALS_SYNC_REQUESTED } from "@/lib/original-photos";
import { retryDelayMs } from "@/lib/upload-schedule";
import {
  flushOfflineJobs,
  getOfflineQueueSummary,
  OFFLINE_QUEUE_CHANGED,
} from "@/services/offline-sync.service";

interface OfflineSyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  refreshCount: () => Promise<void>;
  /**
   * Send what is waiting. `includeRefused` also resends what the server
   * refused (「需要处理」) - only a technician's 立即重试 press on the
   * technical page asks for that; the automatic triggers leave those alone (A9).
   */
  syncNow: (options?: { includeRefused?: boolean }) => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const previousOwnerId = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousOwnerId.current;
    const current = user?.id ?? null;
    if (previous && previous !== current) {
      void clearDriverSnapshots(previous).catch(() => undefined);
      void clearRecyclerSnapshots(previous).catch(() => undefined);
    }
    previousOwnerId.current = current;
  }, [user?.id]);

  const refreshCount = useCallback(async () => {
    if (!user) {
      setPendingCount(0);
      setFailedCount(0);
      return;
    }
    try {
      const summary = await getOfflineQueueSummary(user.id);
      setPendingCount(summary.pending);
      setFailedCount(summary.failed);
    } catch {
      setPendingCount(0);
      setFailedCount(0);
    }
  }, [user]);

  // Passes in a row that sent nothing while something could still go: the
  // next automatic try waits longer each time (15 s up to 5 min).
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncNowRef = useRef<() => Promise<void>>(async () => undefined);

  const scheduleRetry = useCallback((delay: number) => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void syncNowRef.current();
    }, delay);
  }, []);

  const syncNow = useCallback(async (options: { includeRefused?: boolean } = {}) => {
    if (!user || typeof navigator === "undefined" || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await flushOfflineJobs(user.id, options);
      setPendingCount(result.remaining);
      await refreshCount();
      if (result.synced > 0) {
        setLastSyncedAt(new Date().toISOString());
        // The queue carries every kind of site record - deliveries, disposal
        // trips, material out, equipment, progress, sundry claims - not only
        // the five keys this used to name, so a delivery uploaded from the
        // queue stayed off the phone's own list until it went stale. One
        // refetch of what is on screen after an upload is the honest answer -
        // except report aggregations, which wait for the person (audit N6).
        await refreshChanged(queryClient);
        // Records are in: their originals may follow.
        window.dispatchEvent(new Event(ORIGINALS_SYNC_REQUESTED));
      }
      // Automatic retry (Lucas 2026-10-09, point 2): while anything the
      // server has not refused is still here, try again by itself.
      const summary = await getOfflineQueueSummary(user.id).catch(() => null);
      const retryable = summary ? summary.pending - summary.failed : 0;
      if (retryable > 0) {
        failures.current = result.synced > 0 ? 0 : failures.current + 1;
        scheduleRetry(retryDelayMs(failures.current));
      } else {
        failures.current = 0;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient, refreshCount, scheduleRetry, user]);

  useEffect(() => {
    syncNowRef.current = () => syncNow();
  }, [syncNow]);

  // Originals back up by themselves, for whoever is signed in here.
  useAutomaticOriginals(user?.id);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshCount(), 0);
    // Whatever was left from last time goes as soon as the app opens.
    const initialSync = window.setTimeout(() => {
      if (navigator.onLine) void syncNow();
    }, 1_500);

    const onOnline = () => {
      setIsOnline(true);
      failures.current = 0;
      void syncNow();
    };
    const onOffline = () => setIsOnline(false);
    const onQueueChanged = () => {
      void refreshCount();
      // Something new was queued: make sure a try is on the way.
      if (!retryTimer.current && navigator.onLine) scheduleRetry(retryDelayMs(0));
    };
    const onSyncRequested = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncNow();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
    window.addEventListener(OFFLINE_SYNC_REQUESTED, onSyncRequested);
    document.addEventListener("visibilitychange", onVisible);

    // The slow safety net under the backing-off timer.
    const interval = window.setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, 5 * 60_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
      window.removeEventListener(OFFLINE_SYNC_REQUESTED, onSyncRequested);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(initialRefresh);
      window.clearTimeout(initialSync);
      window.clearInterval(interval);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [refreshCount, scheduleRetry, syncNow]);

  const value = useMemo(
    () => ({
      isOnline,
      isSyncing,
      pendingCount,
      failedCount,
      lastSyncedAt,
      refreshCount,
      syncNow,
    }),
    [
      isOnline,
      isSyncing,
      pendingCount,
      failedCount,
      lastSyncedAt,
      refreshCount,
      syncNow,
    ],
  );

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync(): OfflineSyncContextValue {
  const value = useContext(OfflineSyncContext);
  if (!value) {
    throw new Error("useOfflineSync must be used inside OfflineSyncProvider.");
  }
  return value;
}
