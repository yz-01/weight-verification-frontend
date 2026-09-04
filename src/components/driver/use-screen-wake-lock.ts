"use client";

import { useEffect, useState } from "react";

/**
 * Keep the screen on while a trip is running.
 *
 * Browser geolocation stops when the screen locks, so a driver whose phone
 * dims mid-route leaves a hole in their own track. The platform accepted that
 * limit (D-020) rather than shipping a native app; holding the screen awake
 * while a trip is actually in progress is the cheapest thing that narrows it.
 *
 * The lock is dropped whenever the page is hidden — the browser drops it
 * anyway, and holding one for a backgrounded tab would be a battery cost with
 * no benefit — and re-taken when the page comes back. Both halves matter: the
 * classic bug here is acquiring once, losing it to a screen lock, and never
 * asking again, which looks identical to never having asked.
 *
 * `supported` is returned so the caller can say so plainly instead of
 * pretending the screen will stay on. Safari on iOS only gained this in 16.4,
 * and this is a fleet of whatever phones the drivers already own.
 */
export function useScreenWakeLock(active: boolean) {
  const [supported, setSupported] = useState(true);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      // Deferred rather than set straight away, following the same pattern as
      // `useDriverDeviceStatus`: a capability check cannot run during the
      // server render, and setting state synchronously inside an effect
      // cascades a second render before the first has painted.
      const timeout = window.setTimeout(() => setSupported(false), 0);
      return () => window.clearTimeout(timeout);
    }
    if (!active) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const release = () => {
      const held = sentinel;
      sentinel = null;
      setHeld(false);
      void held?.release().catch(() => undefined);
    };

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          release();
          return;
        }
        setHeld(true);
        // The browser releases it on its own when the tab is hidden; keeping
        // our own flag in step means the banner never claims a lock we lost.
        sentinel.addEventListener("release", () => {
          sentinel = null;
          setHeld(false);
        });
      } catch {
        // A denied or unavailable lock is not an error worth interrupting a
        // driver over. The banner already says the screen may sleep.
        setHeld(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
      else release();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [active]);

  return { supported, held };
}
