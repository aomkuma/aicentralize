const PUSH_SW_PATH = '/push-sw.js'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export async function registerPushServiceWorker() {
  const registration = await navigator.serviceWorker.register(PUSH_SW_PATH, { scope: '/' })
  await navigator.serviceWorker.ready
  return registration
}

export async function subscribeToPush(apiBaseUrl: string, accessToken: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('PERMISSION_DENIED')
  }

  const vapidResponse = await fetch(`${apiBaseUrl}/notifications/push/vapid-public-key`)
  const vapidData = await vapidResponse.json() as { publicKey?: string | null }
  if (!vapidData.publicKey) {
    throw new Error('VAPID_NOT_CONFIGURED')
  }

  const registration = await registerPushServiceWorker()
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
  const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH)
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
