const CACHE_NAME = "mse-trace-shell-v14";

// Route families whose navigations are cached for offline replay. Driver
// pages are the PWA shell; the recycler set is the yard's daily working
// surface. Weighing screens are deliberately absent — a cached weighing
// console must never stand in for the live weighbridge.
const OFFLINE_NAVIGATION_PREFIXES = [
  "/driver",
  "/incoming",
  "/tasks",
  "/drivers",
  "/vehicles",
  "/sites",
  "/dashboard",
];

function isOfflineNavigation(pathname) {
  return OFFLINE_NAVIGATION_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
// The phone's own copy of the list thumbnails (client 2026-10-09 二.5, 五.4,
// 五.8): a thumbnail already seen is not downloaded again when the list is
// reopened. Kept apart from the shell cache, so a new app version does not
// throw the pictures away.
//
// * Keyed by the picture's address without its query string: the storage
//   signs a new link every 50 minutes, but the stored file under it never
//   changes (`backend/storage.py`) - the same picture is the same entry.
// * Only the stored thumbnails (`/evidence/thumbnails/`), never a full photo
//   (opened one at a time, and the browser's own cache keeps those), never the
//   API's thumbnail maker (`/api/...`, a new token every few minutes).
// * Read with CORS, so the cache counts a thumbnail's real ~20 KB. A bucket
//   that does not send CORS headers yet makes that read fail: the picture is
//   then fetched exactly as before and simply not kept (an opaque response
//   is counted as megabytes by the browser's quota).
// * At most PHOTO_CACHE_MAX pictures, oldest out first; and a picture first
//   kept longer ago than the history window (180 days unless the page says
//   otherwise) is removed, since its record has left the phone's list (四.2).
const PHOTO_CACHE = "mse-trace-photos-v1";
const PHOTO_CACHE_MAX = 2000;
const PHOTO_KEPT_AT = "x-mse-kept-at";
const DAY_MS = 24 * 60 * 60 * 1000;
let photoWindowDays = 180;
let photoPutsSinceTrim = 0;
// Origins whose CORS read failed while online: not tried again until the
// worker restarts, so a bucket without CORS costs one extra request, not one
// per picture.
const photoOriginsWithoutCors = new Set();

function isStoredThumbnail(url) {
  return (
    url.pathname.includes("/evidence/thumbnails/") &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.includes("/api/evidence/")
  );
}

function photoKey(url) {
  return url.origin + url.pathname;
}

async function trimPhotoCache(cache, { expired = false } = {}) {
  const keys = await cache.keys();
  let left = keys;
  if (expired) {
    const oldest = Date.now() - photoWindowDays * DAY_MS;
    const kept = [];
    for (const key of keys) {
      const entry = await cache.match(key);
      const at = Number(entry?.headers.get(PHOTO_KEPT_AT) || 0);
      if (at && at < oldest) await cache.delete(key);
      else kept.push(key);
    }
    left = kept;
  }
  // cache.keys() lists entries in the order they were put: oldest first.
  const over = left.length - PHOTO_CACHE_MAX;
  for (let index = 0; index < over; index += 1) await cache.delete(left[index]);
}

async function keepPhoto(cache, key, response) {
  const headers = new Headers(response.headers);
  headers.set(PHOTO_KEPT_AT, String(Date.now()));
  const body = await response.blob();
  await cache.put(
    key,
    new Response(body, { status: response.status, statusText: response.statusText, headers }),
  );
  photoPutsSinceTrim += 1;
  if (photoPutsSinceTrim >= 50) {
    photoPutsSinceTrim = 0;
    await trimPhotoCache(cache);
  }
}

async function cachedThumbnail(event, request, url) {
  const key = photoKey(url);
  let cache;
  try {
    cache = await caches.open(PHOTO_CACHE);
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
  } catch {
    return fetch(request);
  }
  if (photoOriginsWithoutCors.has(url.origin)) return fetch(request);
  let response;
  try {
    response = await fetch(url.href, { mode: "cors", credentials: "omit" });
  } catch {
    // No CORS headers on the bucket (a deployment step, see the PR
    // checklist) - or no network at all, which the plain fetch below will
    // report the same way it always did.
    if (self.navigator?.onLine !== false) photoOriginsWithoutCors.add(url.origin);
    return fetch(request);
  }
  if (response.ok && response.type !== "opaque") {
    event.waitUntil(keepPhoto(cache, key, response.clone()).catch(() => undefined));
  }
  return response;
}

const PRECACHE = [
  "/offline",
  "/mse-icon.svg",
  "/mse-icon-192.png",
  "/mse-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // The thumbnails outlive an app update; only old shells go.
            .filter((key) => key !== CACHE_NAME && key !== PHOTO_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Before the origin check: the thumbnails live on the storage's host.
  if (isStoredThumbnail(url)) {
    event.respondWith(cachedThumbnail(event, request, url));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (
    url.pathname === "/trace/field-ready" ||
    url.pathname === "/field-pwa-bootstrap" ||
    url.pathname === "/field-manifest.webmanifest"
    || url.pathname === "/manifest.webmanifest"
    || url.pathname === "/driver-manifest.webmanifest"
    || url.pathname.startsWith("/brand-icon/")
  ) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    const isCachedNavigation = isOfflineNavigation(url.pathname);
    const isDriverNavigation =
      url.pathname === "/driver" || url.pathname.startsWith("/driver/");
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (isCachedNavigation && response.ok) {
            const cachedResponse = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, cachedResponse)),
            );
          }
          return response;
        })
        .catch(async () => {
          if (isCachedNavigation) {
            const exact = await caches.match(request, { ignoreSearch: true });
            if (exact) return exact;
          }
          if (isDriverNavigation) {
            const driverShell = await caches.match("/driver");
            if (driverShell) return driverShell;
          }
          return caches.match("/offline");
        }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/mse-icon")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)),
            );
          }
          return response;
        });
        return cached || fresh;
      }),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "mse-offline-sync") return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "MSE_SYNC_REQUESTED" }),
        );
      }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  // The page says how many days its history keeps (`lib/photo-cache.ts`);
  // thumbnails first kept before that go, and the cache is held to its size.
  if (event.data?.type === "MSE_PHOTO_CACHE_PRUNE") {
    const days = Number(event.data.days);
    if (Number.isFinite(days) && days > 0) photoWindowDays = days;
    event.waitUntil(
      caches
        .open(PHOTO_CACHE)
        .then((cache) => trimPhotoCache(cache, { expired: true }))
        .catch(() => undefined),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "MSE Trace", message: event.data?.text() || "New notification" };
  }
  // A notice that asked to be sounded (`alert_sound`, e.g. a hazard assigned
  // to you, C3) buzzes and stays on the screen until it is touched, rather
  // than sliding away unseen in a pocket. The ring itself is the phone's own
  // notification sound; iOS ignores `vibrate`.
  const urgent = Boolean(payload.data && payload.data.alert_sound);
  event.waitUntil(
    self.registration.showNotification(payload.title || "MSE Trace", {
      body: payload.message || "New notification",
      icon: "/mse-icon-192.png",
      badge: "/mse-icon-192.png",
      data: { url: payload.url || "/notifications" },
      ...(urgent
        ? {
            vibrate: [300, 150, 300, 150, 300],
            requireInteraction: true,
            silent: false,
          }
        : {}),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
