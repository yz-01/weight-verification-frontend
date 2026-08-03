"use client";

import { useEffect } from "react";

export const OFFLINE_SYNC_REQUESTED = "mse:offline-sync-requested";

export function ServiceWorkerRegistration() {
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
      .then((registration) => registration.update())
      .catch(() => undefined);

    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return null;
}
