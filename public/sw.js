// roots service worker: the installed App starts fast and shows a clear offline page instead of the browser's error.
// Only static build files are cached (they never change under the same URL); pages and data always come from the
// network, so nobody sees another person's or an old org's data.
const STATIC = "roots-static-v1"
const OFFLINE = "/offline"

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/app-icon/")) {
    e.respondWith(caches.open(STATIC).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => (res.ok && c.put(req, res.clone()), res)))))
    return
  }
  if (req.mode === "navigate") e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
})
