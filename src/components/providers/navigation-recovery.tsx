"use client";

import { useCallback, useEffect, useRef } from "react";

const RECOVERY_COOLDOWN_MS = 30_000;
const RECOVERY_KEY = "mse-navigation-recovery-at";

/**
 * Recover only when an open browser still references files from an older
 * deployment. Normal navigation is left entirely to the App Router.
 */
export function NavigationRecovery({ deploymentId }: { deploymentId: string }) {
  const checkingVersion = useRef(false);
  const checkDeployment = useCallback(async () => {
    if (checkingVersion.current || deploymentId === "development") return;
    checkingVersion.current = true;
    try {
      const response = await fetch("/api/app-version", { cache: "no-store" });
      if (!response.ok) return;
      const current = (await response.json()) as { deploymentId?: string };
      if (current.deploymentId && current.deploymentId !== deploymentId) {
        window.location.reload();
      }
    } catch {
      // Being offline is not a reason to interrupt the current screen.
    } finally {
      checkingVersion.current = false;
    }
  }, [deploymentId]);

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
    window.addEventListener("focus", checkDeployment);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkDeployment();
    }, 30_000);
    void checkDeployment();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("focus", checkDeployment);
    };
  }, [checkDeployment]);

  return null;
}

function isVersionSkewError(message: string): boolean {
  return /ChunkLoadError|Loading chunk|dynamically imported module|module script|Failed to load Next\.js script|RSC payload/i.test(
    message,
  );
}
