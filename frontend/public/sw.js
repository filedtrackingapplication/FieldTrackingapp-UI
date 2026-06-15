/**
 * Service Worker — TrackForce
 *
 * Caching strategy
 * ────────────────
 *  Static assets  → Cache-first  (app shell, fonts, icons)
 *  API GET calls  → Network-first with stale-while-revalidate fallback
 *  API POST/PUT   → Network-only (mutations handled at app level via IDB queue)
 *
 * This gives the app a fast, reliable shell even with no connectivity.
 */

const CACHE_NAME = 'fieldtracking-v2'
const OFFLINE_PAGE = '/offline.html'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  OFFLINE_PAGE,
]

// ─── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// ─── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ─── Fetch: intercept requests ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip WebSocket and cross-origin requests
  if (request.url.startsWith('ws') || url.origin !== location.origin) return

  // API POST/PUT/DELETE → network-only (IDB queue handles offline writes)
  if (url.pathname.startsWith('/api') && request.method !== 'GET') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ detail: 'Offline — request queued' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // API GET → bypass service worker; let the browser send with full headers
  // (avoids Authorization header being stripped on cross-port redirects in dev)
  if (url.pathname.startsWith('/api')) {
    return
  }

  // Static assets → cache-first, fall back to network, then offline page
  event.respondWith(cacheFirstWithNetworkFallback(request))
})

// ─── Strategies ───────────────────────────────────────────────────────────────

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    return cached || new Response(JSON.stringify({ detail: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Return the offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html') || new Response('Offline', { status: 503 })
    }
    return new Response('Offline', { status: 503 })
  }
}
