// Service worker: offline cache (network-first for the app, cache-first for pinned CDN assets),
// Web Push display and notification clicks. It does NOT monitor prices by itself.
const VERSION = "bh-v2.0.1";
const CORE = ["./", "./index.html", "./css/tokens.css", "./css/app.css", "./js/main.js", "./assets/icon.svg", "./manifest.webmanifest"];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const pinned = url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com";
  if (pinned) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // "no-cache" revalidates with the server (cheap 304) so a new deploy never mixes old and new modules.
  e.respondWith(fetch(req, { cache: "no-cache" }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html"))));
});

// Web Push — only reachable when a backend sends pushes (see README).
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Bourse du Hardware", body: e.data?.text() || "" }; }
  e.waitUntil(self.registration.showNotification(data.title || "Bourse du Hardware", { body: data.body || "", tag: data.tag, data: { route: data.route || "#/alerts" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const route = e.notification.data?.route || "#/alerts";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); c.postMessage({ type: "navigate", route }); return; } }
    await self.clients.openWindow(`./${route}`);
  })());
});
