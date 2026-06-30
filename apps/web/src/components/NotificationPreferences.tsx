import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi'
import { useAuthStore } from '../stores/authStore'
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from '../lib/pushNotifications'

type NotificationSettings = {
  inAppEnabled: boolean
  emailEnabled: boolean
  pushEnabled: boolean
}

export default function NotificationPreferences() {
  const { t } = useTranslation()
  const accessToken = useAuthStore((state) => state.accessToken)
  const { get, patch } = useApi()
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supported = isPushSupported()

  const loadSettings = useCallback(async () => {
    const data = await get<NotificationSettings>('/notifications/settings/me')
    if (data) {
      setSettings(data)
    }
  }, [get])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

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
      setNotice(t('profile.notifications.pushEnabledSuccess'))
    } catch (pushError) {
      const code = pushError instanceof Error ? pushError.message : ''
      if (code === 'PERMISSION_DENIED') {
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
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
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

        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('profile.notifications.pushLabel')}</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">{t('profile.notifications.pushHelp')}</p>
              {!supported && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('profile.notifications.pushUnsupported')}</p>
              )}
            </div>
            {supported && (
              settings.pushEnabled ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleDisablePush()}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t('profile.notifications.disablePush')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleEnablePush()}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {t('profile.notifications.enablePush')}
                </button>
              )
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">{t('profile.notifications.pushEvents')}</p>
        </div>
      </div>
    </div>
  )
}
