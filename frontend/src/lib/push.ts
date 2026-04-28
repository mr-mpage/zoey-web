/* Frontend helpers for Web Push subscription. */

export type PushState = 'unsupported' | 'denied' | 'available' | 'enabled'

export function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export function isStandalone(): boolean {
  // iOS PWAs require standalone mode for Web Push.
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export async function ensureRegistered(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  return navigator.serviceWorker.register('/sw.js')
}

export async function getSubscription(): Promise<PushSubscription | null> {
  if (!isSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

export async function getState(): Promise<PushState> {
  if (!isSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await getSubscription()
  if (sub) return 'enabled'
  return 'available'
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

export async function enablePush(vapidPublicKey: string): Promise<PushSubscription> {
  if (!isSupported()) throw new Error('Push not supported on this browser')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notification permission not granted')
  const reg = await ensureRegistered()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }
  return sub
}

export async function disablePush(): Promise<{ endpoint: string | null }> {
  const sub = await getSubscription()
  if (!sub) return { endpoint: null }
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return { endpoint }
}
