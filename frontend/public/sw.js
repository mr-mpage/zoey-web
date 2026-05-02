/* Zoey Tracker — service worker for push notifications */

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    data = { title: 'Zoey', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Zoey'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: data.tag || 'zoey-default',
    data: { url: data.url || '/' },
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Defense-in-depth: VAPID push payloads are signed by our server, but
  // confine the click target to a same-origin path anyway. Anything that
  // isn't a leading-slash path falls back to '/'.
  const raw = (event.notification.data && event.notification.data.url) || '/'
  const target = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        try {
          const url = new URL(c.url)
          if (url.pathname.startsWith(target) && 'focus' in c) return c.focus()
        } catch (_) { /* ignore */ }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
