"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { OFFLINE_SYNC_REQUESTED } from "@/components/providers/service-worker-registration";
import {
  countOfflineJobs,
  flushOfflineJobs,
  OFFLINE_QUEUE_CHANGED,
} from "@/services/offline-sync.service";

interface OfflineSyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  refreshCount: () => Promise<void>;
  syncNow: () => Promise<void>;
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

  const refreshCount = useCallback(async () => {
    if (!user) {
      setPendingCount(0);
      return;
    }
    try {
      setPendingCount(await countOfflineJobs(user.id));
    } catch {
      setPendingCount(0);
    }
  }, [user]);

  const syncNow = useCallback(async () => {
    if (!user || typeof navigator === "undefined" || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await flushOfflineJobs(user.id);
      setPendingCount(result.remaining);
      if (result.synced > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["attendance"] }),
          queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        ]);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient, user]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshCount(), 0);

    const onOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const onOffline = () => setIsOnline(false);
    const onQueueChanged = () => void refreshCount();
    const onSyncRequested = () => void syncNow();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
    window.addEventListener(OFFLINE_SYNC_REQUESTED, onSyncRequested);

    const interval = window.setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, 60_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
      window.removeEventListener(OFFLINE_SYNC_REQUESTED, onSyncRequested);
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refreshCount, syncNow]);

  const value = useMemo(
    () => ({ isOnline, isSyncing, pendingCount, refreshCount, syncNow }),
    [isOnline, isSyncing, pendingCount, refreshCount, syncNow],
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
