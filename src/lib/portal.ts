import type { Portal } from "@/interfaces/auth";

const PORTAL_PATHS: Record<Portal, { login: string; forgot: string; reset: string }> = {
  MSE_ADMIN: {
    login: "/admin/login",
    forgot: "/admin/forgot-password",
    reset: "/admin/reset-password",
  },
  MSE_TRACE: {
    login: "/trace/login",
    forgot: "/trace/forgot-password",
    reset: "/trace/reset-password",
  },
  MSE_SCRAP: {
    login: "/scrap/login",
    forgot: "/scrap/forgot-password",
    reset: "/scrap/reset-password",
  },
};

export const PORTAL_LABELS: Record<Portal, string> = {
  MSE_ADMIN: "MSE Admin",
  MSE_TRACE: "MSE Trace",
  MSE_SCRAP: "MSE Scrap",
};

export function portalPaths(portal: Portal) {
  return PORTAL_PATHS[portal];
}

export function portalLoginPath(portal: Portal | null | undefined): string {
  return portal ? PORTAL_PATHS[portal].login : "/login";
}

/** Accept only a same-origin application path for post-login navigation. */
export function safeReturnPath(value: string | string[] | undefined): string | undefined {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return undefined;
  }
  return path;
}

export function withReturnPath(path: string, next?: string): string {
  const safe = safeReturnPath(next);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}

/**
 * Client-side guards normally use the App Router, but a deep link can be
 * opened before the router has finished booting. Keep a hard-navigation
 * fallback so an unauthenticated visitor cannot remain on a loading screen.
 */
export function redirectWithFallback(
  router: { replace: (href: string) => void },
  path: string,
  fallbackDelayMs = 250,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const target = new URL(path, window.location.origin);
  const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const isAtTarget = () =>
    window.location.pathname === target.pathname &&
    window.location.search === target.search &&
    window.location.hash === target.hash;
  if (isAtTarget()) return;

  router.replace(path);
  window.setTimeout(() => {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    // Only rescue a router that never left the original screen. If the user
    // has already reached the destination and moved to another page, an old
    // login timer must not drag them back and abort their new navigation.
    if (!isAtTarget() && current === source) {
      markPageLeaving();
      window.location.replace(path);
    }
  }, fallbackDelayMs);
}

type LeavingWindow = Window & { __msePageLeavingAt?: number };

/**
 * Say that this document is being replaced by a full page load.
 *
 * While the browser fetches the next page, the scripts and data the old page
 * was still loading are cancelled. Those cancellations look exactly like a
 * file missing after a deploy, and the recovery for that - reloading - would
 * reload the *old* page and cancel the very navigation that was under way
 * (Lucas 2026-10-22: 「点了一次打开拍照工作台然后还是会跳回去一样的页面」).
 */
export function markPageLeaving(): void {
  if (typeof window === "undefined") return;
  (window as LeavingWindow).__msePageLeavingAt = Date.now();
}

/** True for a few seconds after a full page load was started from here. */
export function isPageLeaving(withinMs = 10_000): boolean {
  if (typeof window === "undefined") return false;
  const at = (window as LeavingWindow).__msePageLeavingAt;
  return typeof at === "number" && Date.now() - at < withinMs;
}

/**
 * Open another page with one full page load, and nothing else.
 *
 * For the hops between the phone's sign-in pages and its workspace. These
 * used `redirectWithFallback`: a client-side route change *and*, 150 ms later
 * if the address had not changed yet, a full load. On a phone that has never
 * loaded the workspace's files (the first open of a home-screen app, or the
 * first tap on 「打开拍照工作台」) the route change is still downloading them at
 * 150 ms; the full load then cancels those downloads, and the half-finished
 * route change either shows Next.js's 「This page couldn't load」 for a moment
 * or makes the deploy recovery reload the page being left. One navigation
 * cannot race itself.
 */
export function replacePage(path: string): void {
  if (typeof window === "undefined") return;
  const target = new URL(path, window.location.origin);
  if (
    window.location.pathname === target.pathname &&
    window.location.search === target.search &&
    window.location.hash === target.hash
  ) {
    return;
  }
  markPageLeaving();
  window.location.replace(path);
}
