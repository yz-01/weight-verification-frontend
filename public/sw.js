const CACHE_NAME = "mse-trace-shell-v15";

// Route families whose navigations are cached for offline replay. Driver
// pages are the PWA shell; the recycler set is the yard's daily working
// surface; `/field-staff` is the site phone's app and `/trace` its sign-in
// pages (H12: 「用户首次联网进入后，即使断网、关闭页面再重新打开，也必须能够进入
// 已缓存的手机端」). Weighing screens are deliberately absent — a cached
// weighing console must never stand in for the live weighbridge.
const OFFLINE_NAVIGATION_PREFIXES = [
  "/driver",
  "/incoming",
  "/tasks",
  "/drivers",
  "/vehicles",
  "/sites",
  "/dashboard",
  "/field-staff",
  "/trace",
];

// Query parameters that carry a credential: a page addressed with one is never
// written to the cache, so nothing that holds a bootstrap or sign-in token
// stays on the phone (`/trace/field-activate?token=`,
// `/trace/reset-password?token=`, `/trace/field-ready?bootstrap=`).
const CREDENTIAL_PARAMS = ["token", "bootstrap", "code", "key", "uid", "invitation"];

function isOfflineNavigation(pathname) {
  return OFFLINE_NAVIGATION_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function carriesCredential(url) {
  return CREDENTIAL_PARAMS.some((name) => url.searchParams.has(name));
}

// The phone's sign-in hops: the field login link lands on
// `/trace/field-ready?bootstrap=…`, and the installed app starts at
// `/field-pwa-bootstrap?token=…` (its manifest's start_url). Both always go to
// the network and are never cached - they carry the token. With no network
// they used to fail outright (the client's ERR_FAILED, H12); now a phone that
// has opened the field app before is sent to its cached copy, where the
// session it already holds lets it carry on offline.
const FIELD_BOOTSTRAP_PATHS = ["/trace/field-ready", "/field-pwa-bootstrap"];
const FIELD_HOME = "/field-staff";

async function offlineBootstrap(request) {
  if (request.mode !== "navigate") {
    return new Response("", { status: 503, statusText: "Offline" });
  }
  const home = await caches.match(FIELD_HOME, { ignoreSearch: true });
  if (home) return Response.redirect(new URL(FIELD_HOME, self.location.origin).href, 302);
  const offline = await caches.match("/offline");
  return offline || new Response("", { status: 503, statusText: "Offline" });
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
// Its size, so 「清理本地记录」 can say how much it frees (`lib/local-cleanup.ts`).
const PHOTO_BYTES = "x-mse-bytes";
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
  headers.set(PHOTO_BYTES, String(body.size));
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

  if (FIELD_BOOTSTRAP_PATHS.includes(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => offlineBootstrap(request)),
    );
    return;
  }

  if (
    url.pathname === "/field-manifest.webmanifest"
    || url.pathname === "/manifest.webmanifest"
    || url.pathname === "/driver-manifest.webmanifest"
    || url.pathname.startsWith("/brand-icon/")
  ) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(
        () => new Response("", { status: 503, statusText: "Offline" }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    const isCachedNavigation =
      isOfflineNavigation(url.pathname) && !carriesCredential(url);
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
          // Any address inside the field app opens its cached home: the app
          // reads its tab and record from the address itself.
          if (url.pathname === FIELD_HOME || url.pathname.startsWith(`${FIELD_HOME}/`)) {
            const fieldShell = await caches.match(FIELD_HOME, { ignoreSearch: true });
            if (fieldShell) return fieldShell;
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
  // Every notice rings and buzzes three times (batch H, HD11: 「每条新通知都
  // 响…响三次」). The ring is the phone's own notification sound; iOS ignores
  // `vibrate`. One that asked to be sounded (`alert_sound`, e.g. a hazard
  // assigned to you, C3) also stays on the screen until it is touched, rather
  // than sliding away unseen in a pocket.
  const urgent = Boolean(payload.data && payload.data.alert_sound);
  // J4: the icon's number is the bell's, sent with the push; skipped where
  // the phone has no Badging API. JB79: awaited with the notice below - left
  // floating, iPhone stopped the worker before it was set, so the icon showed
  // 1 when three were waiting, until the app was opened.
  let badgeSet = Promise.resolve();
  if (typeof payload.badge === "number" && self.navigator) {
    try {
      if (payload.badge > 0 && self.navigator.setAppBadge) badgeSet = self.navigator.setAppBadge(payload.badge);
      else if (payload.badge <= 0 && self.navigator.clearAppBadge) badgeSet = self.navigator.clearAppBadge();
    } catch {
      // Not supported here.
    }
  }
  event.waitUntil(Promise.all([
    Promise.resolve(badgeSet).catch(() => {}),
    self.registration.showNotification(payload.title || "MSE Trace", {
      body: payload.message || "New notification",
      icon: "/mse-icon-192.png",
      badge: "/mse-icon-192.png",
      data: { url: payload.url || "/notifications" },
      vibrate: [300, 200, 300, 200, 300],
      silent: false,
      // JB36: a chat thread is one notice that each new message refreshes.
      // Its tag puts the new words in the old one's place on the lock screen,
      // and `renotify` rings and buzzes again - not a silent swap.
      ...(payload.tag ? { tag: String(payload.tag), renotify: true } : {}),
      ...(urgent ? { requireInteraction: true } : {}),
    }),
  ]));
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
