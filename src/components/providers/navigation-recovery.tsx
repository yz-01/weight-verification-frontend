"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAVIGATION_TIMEOUT_MS = 3_000;
const RECOVERY_COOLDOWN_MS = 30_000;
const RECOVERY_KEY = "mse-navigation-recovery-at";

/**
 * Recover from a client that stayed open across a deployment.
 *
 * Next normally handles internal links without reloading the shell. If an old
 * client bundle cannot consume a newer route payload, however, the URL never
 * changes and the link looks dead. A delayed hard navigation gives the router
 * time to work normally and only takes over when it made no progress at all.
 */
export function NavigationRecovery() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRoute = `${pathname}?${searchParams}`;
  const committedRoute = useRef(currentRoute);
  const [navigationDestination, setNavigationDestination] = useState<
    string | null
  >(null);
  const isNavigating =
    navigationDestination !== null && navigationDestination !== currentRoute;

  useEffect(() => {
    committedRoute.current = currentRoute;
  }, [currentRoute]);

  useEffect(() => {
    let navigationTimer: number | undefined;

    const onClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        anchor.dataset.navigationRecovery === "off" ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.protocol !== window.location.protocol ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      ) {
        return;
      }

      const startingRoute = committedRoute.current;
      setNavigationDestination(
        `${destination.pathname}?${destination.searchParams}`,
      );
      window.clearTimeout(navigationTimer);
      navigationTimer = window.setTimeout(() => {
        if (
          committedRoute.current === startingRoute &&
          document.visibilityState !== "hidden"
        ) {
          window.location.assign(destination.href);
        }
      }, NAVIGATION_TIMEOUT_MS);
    };

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

    document.addEventListener("click", onClick);
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.clearTimeout(navigationTimer);
      document.removeEventListener("click", onClick);
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden transition-opacity ${
        isNavigating ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="block h-full w-2/3 animate-[navigation-progress_900ms_ease-out_infinite] bg-primary" />
    </div>
  );
}

function isVersionSkewError(message: string): boolean {
  return /ChunkLoadError|Loading chunk|dynamically imported module|module script|Failed to load Next\.js script|RSC payload/i.test(
    message,
  );
}
