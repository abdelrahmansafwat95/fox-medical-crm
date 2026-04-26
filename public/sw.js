/* FoxSystems Medical CRM — Service Worker
   Network-first for everything; falls back to cache when offline.
*/
const CACHE_NAME = "fox-medical-v1";
const PRECACHE = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only handle GET
  if (request.method !== "GET") return;

  // API requests — let them hit the network; offlineQueue handles failure on the client side.
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  // Network-first with cache fallback for HTML/static
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => null);
        return res;
      })
      .catch(() =>
        caches.match(request).then((c) => c || caches.match("/offline.html"))
      )
  );
});

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "FoxSystems Medical", body: "", url: "/dashboard" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
