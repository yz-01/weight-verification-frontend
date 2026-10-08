/**
 * The phone's kept thumbnails (`public/sw.js`, client 2026-10-09 二.5, 四.2).
 *
 * The service worker keeps every list thumbnail it has fetched, by its
 * address without the signature, so reopening the list costs no picture
 * twice. It cannot know the company's history window by itself, so the list
 * tells it: thumbnails first kept longer ago than that belong to records that
 * have left the phone's list, and are removed.
 */

/** The message `public/sw.js` listens for. */
export const PHOTO_CACHE_PRUNE = "MSE_PHOTO_CACHE_PRUNE";

/** Ask the service worker to drop thumbnails older than `days`, and hold its size. */
export function prunePhotoCache(days: number): void {
  if (!(days > 0)) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    navigator.serviceWorker.controller?.postMessage({ type: PHOTO_CACHE_PRUNE, days });
  } catch {
    // No worker in control (first visit, a private window): nothing is kept.
  }
}
