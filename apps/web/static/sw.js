const CACHE = "todoapp-v1"

const PRECACHE_URLS = [
  "/",
  "/servers",
  "/manifest.json",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return
  // Don't cache API calls
  if (event.request.url.includes("/api/")) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone()
          caches.open(CACHE).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => cached)
      return cached || fetchPromise
    }),
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.action === "skipWaiting") {
    self.skipWaiting()
  }
})
