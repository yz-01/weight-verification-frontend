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

/**
 * `href` without the parameters `names`, or null when it carries none of
 * them. Pure, so the rule can be tested without a window.
 */
export function addressWithoutParams(
  href: string,
  names: readonly string[],
): string | null {
  const url = new URL(href, "https://same-page.mse-trace.local");
  if (!names.some((name) => url.searchParams.has(name))) return null;
  for (const name of names) url.searchParams.delete(name);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Takes `names` out of the address of the page showing, in the history entry
 * it has, **before this returns** - for a page that a link opened with a
 * parameter (`?notice=`, `?dispatch=`) and that goes on to another address.
 *
 * 客户 11-13 (JB187): 「打开事项，然后按 X 一直会重新弹出来」. A system
 * notification opened 通知中心 at `?notice=<id>`, which went on to the record
 * with `router.push`. The record's X goes back one entry - to `?notice=<id>`,
 * which went on to the record again, for ever: the record could not be
 * closed and no other page could be reached.
 *
 * `router.replace` followed by `router.push` does not do this: the push
 * supersedes the replace that is still on its way, so the entry keeps its
 * parameter (the recycler's `?dispatch=` did exactly that).
 * `history.replaceState` changes the entry at once, and the App Router
 * follows it.
 */
export function dropFromAddress(names: readonly string[]): void {
  if (typeof window === "undefined") return;
  const next = addressWithoutParams(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    names,
  );
  if (next !== null) openOnSamePage(next, true);
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
