/* Simple service worker for PWA installability.
   Netlify hosting: keep caching minimal to avoid stale data issues. */

const CACHE_NAME = 'walletpro-cache-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([]))
      .catch(() => {})
  )
})

self.addEventListener('fetch', (event) => {
  // Network-first for API calls; cache only for successful GETs to non-API static assets.
  const req = event.request
  if (req.method !== 'GET') return

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const url = new URL(req.url)
          const isSameOrigin = url.origin === self.location.origin
          const isApi = url.searchParams.get('action')
          if (isSameOrigin && !isApi) {
            const copy = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
          }
        }
        return res
      })
      .catch(() => caches.match(req))
  )
})
