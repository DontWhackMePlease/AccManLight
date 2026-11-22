// The page works without network: its files are kept on the phone (the data go through app.js).
const CACHE = "am-light-1";
const FILES = ["./", "index.html", "app.js", "core.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Files of the page: from the network when there is one (new version), otherwise from the phone.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;  // Supabase: not touched
  event.respondWith(fetch(event.request).then((answer) => {
    const copy = answer.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return answer;
  }).catch(() => caches.match(event.request)));
});
