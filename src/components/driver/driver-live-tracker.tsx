"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { getDriverDashboardOfflineAware } from "@/services/driver-offline.service";
import { submitTaskPositionOfflineAware } from "@/services/offline-sync.service";

/** Keep the active trip visible even when the driver is on another app tab. */
export function DriverLiveTracker() {
  const { user } = useAuth();
  const pathname = usePathname();
  const lastSentAt = useRef(0);
  const realtimeKeys = useMemo(
    () => [["driver", "dashboard"], ["tasks", "mine"]],
    [],
  );
  useOrderRealtime(realtimeKeys);
  const dashboard = useQuery({
    queryKey: ["driver", "dashboard"],
    queryFn: () => getDriverDashboardOfflineAware(user!.id),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const task = dashboard.data?.current_task;
    const detailAlreadyTracks = /^\/driver\/[0-9a-f-]{36}$/i.test(pathname);
    if (
      !user ||
      !task?.is_running ||
      task.state === "ASSIGNED" ||
      detailAlreadyTracks ||
      !navigator.geolocation
    ) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAt.current < 30_000) return;
        lastSentAt.current = now;
        void submitTaskPositionOfflineAware(user.id, {
          taskId: task.id,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracyM: position.coords.accuracy.toFixed(2),
          originalOccurredAt: new Date(position.timestamp).toISOString(),
        }).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [dashboard.data?.current_task, pathname, user]);

  return null;
}
