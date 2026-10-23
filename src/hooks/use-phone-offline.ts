"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * True while the phone itself says it has no connection.
 *
 * The browser's own word, not a guess from failed requests: it is what lets a
 * screen say "no network" once and calmly instead of a red error per section
 * (Lucas 2026-10-23). The server render, and a browser that will not say,
 * count as online.
 */
export function usePhoneOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine === false,
    () => false,
  );
}
