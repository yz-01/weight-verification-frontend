/**
 * Put one app page into the service worker's shell cache from inside the app.
 *
 * `public/sw.js` keeps a page only when the browser loads it as a full page.
 * The phone apps never do that for their home: the sign-in link
 * (`/trace/field-ready`), the installed app's start page
 * (`/field-pwa-bootstrap`) and the login all move on with `router.replace`,
 * a soft navigation under the one root layout. So without this the field
 * app's home was never stored, and a phone opened offline found nothing but
 * the offline page (H12). The driver app had the same gap and the same fix.
 *
 * The page's own scripts and styles are stored with it: on the very first
 * visit they load before the worker controls the page, so the worker never
 * saw them, and a page without its scripts opens blank.
 *
 * Only a plain address is ever stored - no query, no fragment - so nothing
 * that carries a bootstrap or sign-in token is kept on the phone.
 */

/** The prefix of the worker's shell cache; the number after it is its version. */
export const SHELL_CACHE_PREFIX = "mse-trace-shell-v";

/** The build's own files a page names: `/_next/static/…js|css`. */
const STATIC_ASSET = /\/_next\/static\/[A-Za-z0-9_\-./~%]+?\.(?:js|css)/g;

/**
 * The worker's current shell cache, or `null` when it has not made one yet.
 *
 * The newest version wins: during an update the old cache lingers until the
 * new worker activates. Never a guessed name - a page put into a cache the
 * worker does not read is a page that is not there offline.
 */
export function currentShellCache(names: readonly string[]): string | null {
  let best: { name: string; version: number } | null = null;
  for (const name of names) {
    if (!name.startsWith(SHELL_CACHE_PREFIX)) continue;
    const version = Number(name.slice(SHELL_CACHE_PREFIX.length));
    if (!Number.isFinite(version)) continue;
    if (!best || version > best.version) best = { name, version };
  }
  return best?.name ?? null;
}

/** The static files a page's HTML names, each once, as absolute addresses. */
export function pageAssets(html: string, origin: string): string[] {
  return [...new Set(html.match(STATIC_ASSET) ?? [])].map((path) => new URL(path, origin).href);
}

/** True when the page was fetched and stored. Never throws. */
export async function cacheShellPage(pathname: string): Promise<boolean> {
  try {
    if (
      typeof window === "undefined" ||
      typeof caches === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.onLine
    ) {
      return false;
    }
    const url = new URL(pathname, window.location.origin);
    // A plain page only: a query or fragment may carry a token.
    if (url.origin !== window.location.origin || url.search || url.hash) return false;
    const shell = currentShellCache(await caches.keys());
    if (!shell) return false;
    const response = await fetch(url.href, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    // A redirect would store another page under this address.
    if (!response.ok || response.redirected) return false;
    const html = await response.text();
    const cache = await caches.open(shell);
    // The scripts first: a stored page whose scripts are missing is worse
    // than none, so the page goes in only once they are there.
    for (const asset of pageAssets(html, window.location.origin)) {
      if (await cache.match(asset)) continue;
      const file = await fetch(asset, { credentials: "same-origin" });
      if (!file.ok) return false;
      await cache.put(asset, file);
    }
    await cache.put(
      url.href,
      new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
    return true;
  } catch {
    // Storage blocked or the network went: the app simply is not stored yet.
    return false;
  }
}

/**
 * Store the page once the worker is running, and again whenever the network
 * comes back. On a first visit the worker installs after the page opens, and
 * its cache does not exist until then. Returns the cleanup for an effect.
 */
export function keepShellPageStored(pathname: string): () => void {
  if (typeof window === "undefined") return () => undefined;
  let alive = true;
  const store = () => {
    if (alive) void cacheShellPage(pathname);
  };
  store();
  void navigator.serviceWorker?.ready.then(store).catch(() => undefined);
  window.addEventListener("online", store);
  return () => {
    alive = false;
    window.removeEventListener("online", store);
  };
}
