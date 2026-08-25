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
            .filter((key) => key !== CACHE_NAME)
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
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "MSE Trace", message: event.data?.text() || "New notification" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "MSE Trace", {
      body: payload.message || "New notification",
      icon: "/mse-icon-192.png",
      badge: "/mse-icon-192.png",
      data: { url: payload.url || "/notifications" },
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
