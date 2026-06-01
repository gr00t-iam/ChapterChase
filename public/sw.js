const cacheName = "chapterchase-smart-cache-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) =>
      cache.addAll(["/", "/books", "/want-to-read", "/manifest.webmanifest", "/background-wood.jpg", "/shelf-wood.jpg", "/parchment.svg"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_READING" && data.bookId) {
    event.waitUntil(cacheReadingBook(data.bookId));
  }
  if (data.type === "CACHE_WANT_TO_READ") {
    event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(["/want-to-read", "/api/collections"])));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && shouldCache(request.url)) {
          const clone = response.clone();
          caches.open(cacheName).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        if (request.mode === "navigate") {
          return (await caches.match("/")) || Response.error();
        }
        return Response.error();
      })
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "chapterchase-sync-progress") {
    event.waitUntil(notifyClientsSync());
  }
});

async function cacheReadingBook(bookId) {
  const cache = await caches.open(cacheName);
  await cache.addAll([`/reader/${bookId}`, `/api/books/${bookId}/file`, `/api/books/${bookId}/cover`].map((url) => new Request(url, { credentials: "include" })));
}

function shouldCache(url) {
  const parsed = new URL(url);
  return parsed.origin === self.location.origin && ["/", "/books", "/want-to-read", "/reader", "/api/books"].some((path) => parsed.pathname.startsWith(path));
}

async function notifyClientsSync() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: "SYNC_PENDING_PROGRESS" }));
}
