import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi'
import { useAuthStore } from '../stores/authStore'
import { usePushSetup } from '../hooks/usePushSetup'
import {
  registerPushServiceWorker,
  subscribeToPush,
  unsubscribeFromPush
} from '../lib/pushNotifications'
import { resolveApiBaseUrl } from '../lib/pwaUtils'
import PushSetupPanel from './PushSetupPanel'

type NotificationSettings = {
  inAppEnabled: boolean
  emailEnabled: boolean
  pushEnabled: boolean
}

export default function NotificationPreferences() {
  const { t } = useTranslation()
  const accessToken = useAuthStore((state) => state.accessToken)
  const { get, patch } = useApi()
  const apiBaseUrl = resolveApiBaseUrl()
  const { canRequestPush, refresh: refreshPushSetup } = usePushSetup()

  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    const data = await get<NotificationSettings>('/notifications/settings/me')
    if (data) {
      setSettings(data)
    }
  }, [get])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (!canRequestPush) {
      return
    }

    void registerPushServiceWorker().catch(() => {
      // Enable flow will surface registration errors.
    })
  }, [canRequestPush])

  const updateSettings = async (next: Partial<NotificationSettings>) => {
    setIsBusy(true)
    setNotice(null)
    setError(null)

    try {
      const updated = await patch<NotificationSettings>('/notifications/settings/me', next)
      if (updated) {
        setSettings(updated)
        setNotice(t('profile.notifications.saved'))
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('profile.notifications.saveFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleEnablePush = async () => {
    if (!accessToken) {
      setError(t('profile.notifications.loginRequired'))
      return
    }

    setIsBusy(true)
    setNotice(null)
    setError(null)

    try {
      await subscribeToPush(apiBaseUrl, accessToken)
      const updated = await patch<NotificationSettings>('/notifications/settings/me', { pushEnabled: true })
      if (updated) {
        setSettings(updated)
      }
      await refreshPushSetup()
      setNotice(t('profile.notifications.pushEnabledSuccess'))
    } catch (pushError) {
      const code = pushError instanceof Error ? pushError.message : ''
      if (code === 'IOS_NEEDS_HOME_SCREEN') {
        setError(t('profile.notifications.iosNeedsHomeScreen'))
      } else if (code === 'PERMISSION_DENIED') {
        setError(t('profile.notifications.permissionDenied'))
      } else if (code === 'VAPID_NOT_CONFIGURED') {
        setError(t('profile.notifications.vapidMissing'))
      } else {
        setError(t('profile.notifications.pushEnableFailed'))
      }
    } finally {
      setIsBusy(false)
    }
  }

  const handleDisablePush = async () => {
    if (!accessToken) {
      return
    }

    setIsBusy(true)
    setNotice(null)
    setError(null)

    try {
      await unsubscribeFromPush(apiBaseUrl, accessToken)
      const updated = await patch<NotificationSettings>('/notifications/settings/me', { pushEnabled: false })
      if (updated) {
        setSettings(updated)
      }
      await refreshPushSetup()
      setNotice(t('profile.notifications.pushDisabledSuccess'))
    } catch {
      setError(t('profile.notifications.pushDisableFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  if (!settings) {
    return (
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-600 dark:text-slate-400">{t('common.loading')}...</p>
      </div>
    )
  }

  return (
    <div id="notifications" className="mt-6 scroll-mt-24 rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.notifications.title')}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{t('profile.notifications.description')}</p>

      {(notice || error) && (
        <div className={`mt-4 rounded-md px-3 py-2 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
          {error || notice}
        </div>
      )}

      <div className="mt-4 space-y-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.inAppEnabled}
            disabled={isBusy}
            onChange={(event) => void updateSettings({ inAppEnabled: event.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('profile.notifications.inAppLabel')}</span>
            <span className="block text-xs text-gray-600 dark:text-slate-400">{t('profile.notifications.inAppHelp')}</span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.emailEnabled}
            disabled={isBusy}
            onChange={(event) => void updateSettings({ emailEnabled: event.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('profile.notifications.emailLabel')}</span>
            <span className="block text-xs text-gray-600 dark:text-slate-400">{t('profile.notifications.emailHelp')}</span>
          </span>
        </label>

        <PushSetupPanel
          pushEnabled={settings.pushEnabled}
          isBusy={isBusy}
          onEnablePush={() => void handleEnablePush()}
          onDisablePush={() => void handleDisablePush()}
        />
      </div>
    </div>
  )
}
