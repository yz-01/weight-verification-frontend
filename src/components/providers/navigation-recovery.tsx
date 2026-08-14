"use client";

import { useEffect } from "react";

const RECOVERY_COOLDOWN_MS = 30_000;
const RECOVERY_KEY = "mse-navigation-recovery-at";

/**
 * Recover only when an open browser still references files from an older
 * deployment. Normal navigation is left entirely to the App Router.
 */
export function NavigationRecovery() {
  useEffect(() => {
    const recoverFromVersionError = (reason: unknown) => {
      const message =
        reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? "");
      if (!isVersionSkewError(message)) return;

      const lastRecovery = Number(window.sessionStorage.getItem(RECOVERY_KEY) ?? 0);
      if (Date.now() - lastRecovery < RECOVERY_COOLDOWN_MS) return;
      window.sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      const resource = event.target;
      if (
        resource instanceof HTMLScriptElement &&
        resource.src.includes("/_next/static/")
      ) {
        recoverFromVersionError("Failed to load Next.js script");
        return;
      }
      recoverFromVersionError(event.error ?? event.message);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      recoverFromVersionError(event.reason);
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

function isVersionSkewError(message: string): boolean {
  return /ChunkLoadError|Loading chunk|dynamically imported module|module script|Failed to load Next\.js script|RSC payload/i.test(
    message,
  );
}
