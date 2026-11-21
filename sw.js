/* GTR Retail service worker. Kept small on purpose:
   - Pages always come fresh from the network, so site updates show up right away.
   - If the phone is offline, it shows the last copy of the page it saw (or the home page).
   - Nothing else is cached. Bump VERSION to clear the old copies. */
const VERSION = "gtr-v1";
const SHELL = ["/", "/card/", "/icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && new URL(req.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("/"))
    )
  );
});
