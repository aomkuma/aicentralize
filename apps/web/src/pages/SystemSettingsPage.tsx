import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import type { SystemSettings } from '../types'

export default function SystemSettingsPage() {
  const { t } = useTranslation()
  const { get, patch, isLoading, error } = useApi()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [saveMessage, setSaveMessage] = useState('')

  const fetchSettings = useCallback(async () => {
    const data = await get<SystemSettings>('/system-settings')
    if (data) {
      setSettings(data)
    }
  }, [get])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const setValue = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    if (!settings) {
      return
    }

    setSettings({ ...settings, [key]: value })
  }

  const onSave = async () => {
    if (!settings) {
      return
    }

    const updated = await patch<SystemSettings>('/system-settings', settings)
    if (updated) {
      setSettings(updated)
      setSaveMessage(t('settings.saved'))
      window.setTimeout(() => setSaveMessage(''), 2200)
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {t('settings.title')}
          </h1>
          <p className="text-base sm:text-lg text-gray-600 dark:text-slate-400">
            {t('settings.description')}
          </p>
        </div>

        {isLoading && !settings && (
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-6 text-sm text-gray-600 dark:text-slate-300">
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-700 dark:text-red-300 mb-6">
            {error.message}
          </div>
        )}

        {settings && (
          <div className="space-y-6">
            <section className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('settings.categories.ai')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.asrMode')}
                  <select
                    value={settings.ai.asrMode}
                    onChange={(e) => setValue('ai', { ...settings.ai, asrMode: e.target.value as SystemSettings['ai']['asrMode'] })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    <option value="hybrid">Hybrid</option>
                    <option value="whisper">Whisper</option>
                    <option value="browser">Browser</option>
                  </select>
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.whisperModel')}
                  <input
                    value={settings.ai.whisper.model}
                    onChange={(e) => setValue('ai', { ...settings.ai, whisper: { ...settings.ai.whisper, model: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.whisperLanguage')}
                  <input
                    value={settings.ai.whisper.language}
                    onChange={(e) => setValue('ai', { ...settings.ai, whisper: { ...settings.ai.whisper, language: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.whisperTimeoutMs')}
                  <input
                    type="number"
                    min={3000}
                    max={180000}
                    value={settings.ai.whisper.timeoutMs}
                    onChange={(e) => setValue('ai', { ...settings.ai, whisper: { ...settings.ai.whisper, timeoutMs: Number(e.target.value) || 30000 } })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.ai.whisper.enabled}
                    onChange={(e) => setValue('ai', { ...settings.ai, whisper: { ...settings.ai.whisper, enabled: e.target.checked } })}
                  />
                  {t('settings.whisperEnabled')}
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.integrations.ollamaEnabled}
                    onChange={(e) => setValue('integrations', { ...settings.integrations, ollamaEnabled: e.target.checked })}
                  />
                  {t('settings.ollamaEnabled')}
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('settings.categories.security')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.security.forceMfaForSuperAdmin}
                    onChange={(e) => setValue('security', { ...settings.security, forceMfaForSuperAdmin: e.target.checked })}
                  />
                  {t('settings.forceMfaForSuperAdmin')}
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.sessionTtlHours')}
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={settings.security.sessionTtlHours}
                    onChange={(e) => setValue('security', { ...settings.security, sessionTtlHours: Number(e.target.value) || 12 })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('settings.categories.notifications')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.notifications.emailEnabled}
                    onChange={(e) => setValue('notifications', { ...settings.notifications, emailEnabled: e.target.checked })}
                  />
                  {t('settings.emailEnabled')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.notifications.digestEnabled}
                    onChange={(e) => setValue('notifications', { ...settings.notifications, digestEnabled: e.target.checked })}
                  />
                  {t('settings.digestEnabled')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.notifications.escalationEnabled}
                    onChange={(e) => setValue('notifications', { ...settings.notifications, escalationEnabled: e.target.checked })}
                  />
                  {t('settings.escalationEnabled')}
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('settings.categories.integrations')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.integrations.whisperEnabled}
                    onChange={(e) => setValue('integrations', { ...settings.integrations, whisperEnabled: e.target.checked })}
                  />
                  {t('settings.whisperIntegrationEnabled')}
                </label>
              </div>
            </section>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSave}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-semibold"
                disabled={isLoading}
              >
                {t('settings.save')}
              </button>
              {saveMessage && <span className="text-sm text-emerald-700 dark:text-emerald-400">{saveMessage}</span>}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
