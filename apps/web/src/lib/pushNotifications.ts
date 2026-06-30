import { isIosDevice, isStandalonePwa } from './pwaUtils'

const PUSH_SW_PATH = '/push-sw.js'
const PUSH_SW_SCOPE = '/'

export type PushSupportState =
  | { status: 'ready' }
  | { status: 'ios-needs-home-screen' }
  | { status: 'unsupported'; reason?: string }
  | { status: 'permission-denied' }

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function getPushSupportState(): PushSupportState {
  if (typeof window === 'undefined') {
    return { status: 'unsupported' }
  }

  if (isIosDevice() && !isStandalonePwa()) {
    return { status: 'ios-needs-home-screen' }
  }

  const hasApis = 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  if (!hasApis) {
    return { status: 'unsupported' }
  }

  if (Notification.permission === 'denied') {
    return { status: 'permission-denied' }
  }

  return { status: 'ready' }
}

export function isPushSupported() {
  return getPushSupportState().status === 'ready'
}

export async function registerPushServiceWorker() {
  const registration = await navigator.serviceWorker.register(PUSH_SW_PATH, { scope: PUSH_SW_SCOPE })
  await navigator.serviceWorker.ready
  return registration
}

export async function subscribeToPush(apiBaseUrl: string, accessToken: string) {
  const support = getPushSupportState()
  if (support.status === 'ios-needs-home-screen') {
    throw new Error('IOS_NEEDS_HOME_SCREEN')
  }
  if (support.status === 'unsupported') {
    throw new Error('UNSUPPORTED')
  }
  if (support.status === 'permission-denied') {
    throw new Error('PERMISSION_DENIED')
  }

  // iOS requires an active service worker before the permission prompt appears.
  const registration = await registerPushServiceWorker()

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('PERMISSION_DENIED')
  }

  const vapidResponse = await fetch(`${apiBaseUrl}/notifications/push/vapid-public-key`)
  const vapidData = await vapidResponse.json() as { publicKey?: string | null }
  if (!vapidData.publicKey) {
    throw new Error('VAPID_NOT_CONFIGURED')
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey)
  })

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('SUBSCRIPTION_INVALID')
  }

  const saveResponse = await fetch(`${apiBaseUrl}/notifications/push-subscriptions/me`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth
      },
      expirationTime: json.expirationTime ?? null
    })
  })

  if (!saveResponse.ok) {
    throw new Error('SUBSCRIPTION_SAVE_FAILED')
  }

  return subscription
}

export async function unsubscribeFromPush(apiBaseUrl: string, accessToken: string) {
  const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE)
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) {
    return
  }

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  await fetch(`${apiBaseUrl}/notifications/push-subscriptions/me`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ endpoint })
  })
}
