/* global __VERSION__, __ASSETS__ */
const prefix = `chapterchase-standalone:${self.registration.scope}:`;
const cacheName = `${prefix}${__VERSION__}`;
const assets = __ASSETS__.map(file => new URL(file, self.registration.scope).href);
const shell = new URL("index.html", self.registration.scope).href;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
  // Updates wait until the user requests activation; the initial worker activates normally.
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) { if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key); }
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
  if (event.data?.type === "CACHE_STATUS") event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const results = await Promise.all(assets.map(url => cache.match(url)));
    event.ports[0]?.postMessage({ ready: results.every(Boolean) });
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const exact = new URL(url.pathname, url.origin).href;
  if (!assets.includes(exact) && request.mode !== "navigate") return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(exact);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match(shell);
      if (fallback) return fallback;
    }
    return fetch(request);
  })());
});
