/* WalletVibe Service Worker
   - Network-first with cache fallback for static assets
   - Version detection: polls /version.json and notifies clients on change
   - Posts SW_UPDATED message to all clients when a new SW activates
*/

const CACHE_NAME = 'walletvibe-cache-v5'
const VERSION_KEY = 'wv-deployed-version'

// On install — cache shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting() // activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/'])
    ).catch(() => {})
  )
})

// On activate — clean old caches, check version, notify clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean old caches
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
      // Claim clients
      await self.clients.claim()

      // Notify all clients that SW updated
      const allClients = await self.clients.matchAll({ includeUncontrolled: true })
      allClients.forEach((client) =>
        client.postMessage({ type: 'SW_ACTIVATED' })
      )

      // Check version.json for app content updates
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (res.ok) {
          const { version } = await res.json()
          const stored = await getStoredVersion()
          if (stored && stored !== version) {
            // New app version deployed — notify clients
            allClients.forEach((client) =>
              client.postMessage({ type: 'APP_UPDATED', version })
            )
          }
          await storeVersion(version)
        }
      } catch (_) {}
    })()
  )
})

// Fetch handler — network first, cache fallback for same-origin requests only
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Don't intercept cross-origin / third-party requests (Firebase, Razorpay, Fonts, CDNs)
  // Browser loads them natively according to style-src, font-src, img-src, etc.
  if (url.origin !== self.location.origin) return

  // Don't cache version.json (always fresh)
  if (url.pathname === '/version.json') {
    event.respondWith(fetch(req).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })))
    return
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const isSameOrigin = url.origin === self.location.origin
          if (isSameOrigin) {
            const copy = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
          }
        }
        return res
      })
      .catch(() => caches.match(req))
  )
})

// Notification Click Handler (works even when app is closed)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/?action=subscription'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl)
          }
          return client.focus()
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// Periodic version check message from app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_VERSION') {
    checkAndNotifyVersion(event.source)
  }
})

async function checkAndNotifyVersion(client) {
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) return
    const { version } = await res.json()
    const stored = await getStoredVersion()
    if (stored && stored !== version) {
      const target = client || (await self.clients.matchAll({ includeUncontrolled: true }))[0]
      if (target) target.postMessage({ type: 'APP_UPDATED', version })
      await storeVersion(version)
    } else if (!stored) {
      await storeVersion(version)
    }
  } catch (_) {}
}

// IDB-lite: store version in Cache Storage metadata
async function getStoredVersion() {
  try {
    const cache = await caches.open('wv-meta')
    const res = await cache.match('/__version')
    if (!res) return null
    return await res.text()
  } catch { return null }
}

async function storeVersion(v) {
  try {
    const cache = await caches.open('wv-meta')
    await cache.put('/__version', new Response(v, { headers: { 'Content-Type': 'text/plain' } }))
  } catch {}
}
