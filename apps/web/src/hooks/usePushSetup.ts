import { useCallback, useEffect, useState } from 'react'
import { isIosDevice, isStandalonePwa } from '../lib/pwaUtils'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePushSetup() {
  const [isPwaInstalled, setIsPwaInstalled] = useState(() => isStandalonePwa())
  const [isIos] = useState(() => isIosDevice())
  const [isNativeInstallable, setIsNativeInstallable] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>(() => (
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  ))

  const refresh = useCallback(async () => {
    setIsPwaInstalled(isStandalonePwa())

    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission)
    }

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      setHasSubscription(Boolean(subscription))
    }
  }, [])

  useEffect(() => {
    void refresh()

    const handleVisibility = () => {
      void refresh()
    }

    window.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsNativeInstallable(true)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsNativeInstallable(false)
      void refresh()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    if (isStandalonePwa()) {
      setIsNativeInstallable(false)
    }

    return () => {
      window.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [refresh])

  const installNative = async () => {
    if (!installPrompt) {
      return false
    }

    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    setInstallPrompt(null)
    setIsNativeInstallable(false)
    await refresh()
    return outcome === 'accepted'
  }

  const needsPwaInstall = isIos && !isPwaInstalled
  const canRequestPush = !needsPwaInstall
    && typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && permission !== 'denied'

  return {
    isIos,
    isPwaInstalled,
    needsPwaInstall,
    isNativeInstallable,
    hasSubscription,
    permission,
    canRequestPush,
    installNative,
    refresh,
  }
}
