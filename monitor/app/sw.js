const VERSION = "scm-2025-11-v1";
const SHELL = [
  "./", "index.html", "style.css", "app.js", "data.js", "config.js", "engine.js", "simulator.js", "live.js", "model.js",
  "control.html", "control.css", "control.js", "manifest.webmanifest",
  "logo.png", "icon-192.png", "icon-maskable-512.png", "apple-touch-icon.png",
  "fonts/inter-latin-400-normal.woff2", "fonts/inter-latin-500-normal.woff2", "fonts/inter-latin-600-normal.woff2",
  "fonts/inter-latin-700-normal.woff2", "fonts/jetbrains-mono-latin-400-normal.woff2", "fonts/jetbrains-mono-latin-500-normal.woff2",
];
const HEAVY = /\/(model|data)\.js$|\.(png|woff2)$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const save = (req, res) => {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const cached = () => caches.match(req, { ignoreSearch: true });

  if (req.mode === "navigate" || url.pathname.endsWith("/config.js")) {
    e.respondWith(fetch(req).then((res) => save(req, res)).catch(() => cached().then((hit) => hit || caches.match("index.html"))));
    return;
  }
  if (HEAVY.test(url.pathname)) {
    e.respondWith(cached().then((hit) => hit || fetch(req).then((res) => save(req, res))));
    return;
  }
  e.respondWith(cached().then((hit) => {
    const net = fetch(req).then((res) => save(req, res)).catch(() => hit);
    return hit || net;
  }));
});
