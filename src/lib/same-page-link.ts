/**
 * Moving between two menu entries that are one page with a different query
 * (`/site-access` and `/site-access?tab=gate`) needs no trip to the server:
 * the page is already on screen and reads its tab from the address. A plain
 * `<Link>` with prefetching off still asks the server for the route first,
 * which is the pause Lucas saw on the 工地门禁 sidebar (2026-10-10).
 *
 * Next.js keeps `useSearchParams` in step with `history.pushState` /
 * `replaceState` only when the state passed is not its own router state, so
 * these always pass `null`.
 */

/** Whether `href` is the page already showing, differing only in its query. */
export function isSamePage(href: string): boolean {
  if (typeof window === "undefined") return false;
  const target = new URL(href, window.location.href);
  return (
    target.origin === window.location.origin &&
    target.pathname === window.location.pathname
  );
}

/** Opens `href` on the page already showing, without asking the server. */
export function openOnSamePage(href: string, replace = false): void {
  const target = new URL(href, window.location.href);
  const path = `${target.pathname}${target.search}${target.hash}`;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
}

/** A click the browser should handle itself (new tab, new window, …). */
export function isModifiedClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
