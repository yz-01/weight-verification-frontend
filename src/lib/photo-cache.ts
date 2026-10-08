/**
 * The phone's kept thumbnails (`public/sw.js`, client 2026-10-09 二.5, 四.2).
 *
 * The service worker keeps every list thumbnail it has fetched, by its
 * address without the signature, so reopening the list costs no picture
 * twice. It cannot know the company's history window by itself, so the list
 * tells it: thumbnails first kept longer ago than that belong to records that
 * have left the phone's list, and are removed.
 *
 * The window is also remembered on the phone, so every app open prunes
 * (`ServiceWorkerRegistration`), not only the opens that reach the list.
 */

/** The message `public/sw.js` listens for. */
export const PHOTO_CACHE_PRUNE = "MSE_PHOTO_CACHE_PRUNE";

const WINDOW_KEY = "mse-history-window-days";

/** The history window the list last read from the server, if any. */
export function rememberedHistoryWindowDays(): number | null {
  try {
    const days = Number(localStorage.getItem(WINDOW_KEY));
    return days > 0 ? days : null;
  } catch {
    return null;
  }
}

/** Ask the service worker to drop thumbnails older than `days`, and hold its size. */
export function prunePhotoCache(days: number): void {
  if (!(days > 0)) return;
  try {
    localStorage.setItem(WINDOW_KEY, String(days));
  } catch {
    // Not remembered; this prune still goes.
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const message = { type: PHOTO_CACHE_PRUNE, days };
  try {
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage(message);
      return;
    }
    // The first open after install has no controller yet: the active worker
    // is told once it is ready.
    void navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage(message))
      .catch(() => undefined);
  } catch {
    // No worker at all (a private window): nothing is kept.
  }
}
