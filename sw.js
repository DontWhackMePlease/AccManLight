// The page works without network: its files are kept on the phone (the data go through app.js).
// Releasing a version: change VERSION in core.js and the ?v= of index.html and app.js (a test checks they
// agree), and the name of CACHE below.
const CACHE = "am-light-3";
const FILES = ["./", "index.html", "app.js", "core.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "watermark.jpg"];

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
  // "no-cache": the server is asked whether the file changed (a short answer when it did not), so a new
  // version is taken at once instead of the copy the browser keeps for 10 minutes.
  event.respondWith(fetch(event.request, { cache: "no-cache" }).then((answer) => {
    const copy = answer.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return answer;
  }).catch(() => caches.match(event.request, { ignoreSearch: true })));
});
