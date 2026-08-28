// App-shell service worker: makes the POS installable and reopenable offline.
// Supabase's REST/auth endpoints are always network-only — live sales/stock
// data must never be served stale — matching the original vanilla app's SW
// behavior. Storage (product photos, the store logo) is different: uploads
// are written to a timestamped path that never gets reused (see
// ProductModal's save()), so a given image URL's bytes never change —
// caching them forever is safe and is what stops product images
// re-fetching every time the POS grid remounts.
const SHELL_CACHE = "pos-shell-v1";
const RUNTIME_CACHE = "pos-runtime-v1";
const IMAGE_CACHE = "pos-images-v1";
const CACHES = [SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSupabaseApiRequest(url) {
  return url.hostname.endsWith(".supabase.co") && /\/(rest|auth)\/v\d+\//.test(url.pathname);
}
function isSupabaseStorageRequest(url) {
  return url.hostname.endsWith(".supabase.co") && /\/storage\/v\d+\//.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (isSupabaseApiRequest(url)) return; // always live, never cached

  // Product/logo images: cache-first, forever — the URL's path is unique
  // per upload, so a cache hit is never stale.
  if (isSupabaseStorageRequest(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // fonts/CDNs: untouched

  // Next.js build assets are content-hashed — safe to cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Pages, manifest, icons: prefer fresh network, fall back to cache when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (await caches.match("/pos")))
  );
});
