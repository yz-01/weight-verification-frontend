"use client";

import { useEffect } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { prunePhotoCache, rememberedHistoryWindowDays } from "@/lib/photo-cache";
import { refreshPushRegistration } from "@/services/push-notification.service";

export const OFFLINE_SYNC_REQUESTED = "mse:offline-sync-requested";

export function ServiceWorkerRegistration() {
  const { user } = useAuth();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        );
      if ("caches" in window) {
        void caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("mse-trace-shell-"))
                .map((key) => caches.delete(key)),
            ),
          );
      }
      return;
    }

    const requestSync = () =>
      window.dispatchEvent(new Event(OFFLINE_SYNC_REQUESTED));
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "MSE_SYNC_REQUESTED") requestSync();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        await registration.update();
        // Every app open: cached photos past the history window go (四.2).
        const days = rememberedHistoryWindowDays();
        if (days) prunePhotoCache(days);
      })
      .catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  // Every app open and every sign-in: this phone's push registration posted,
  // and made again when the phone or Apple / Google lost it (JB156, 客户
  // 11-10 第四批: 「苹果手机重启了之后，声音红点都没有」).
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then(() => refreshPushRegistration())
      .catch(() => undefined);
  }, [user]);

  return null;
}
