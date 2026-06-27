import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import type { AiProviderAccount, SystemSettings } from '../types'

type AiProvider = AiProviderAccount['provider']

const providerOptions: AiProvider[] = ['ollama', 'openai', 'anthropic', 'gemini']

const providerBaseUrls: Record<AiProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  ollama: 'http://localhost:11434'
}

const providerModelOptions: Record<AiProvider, string[]> = {
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.0-flash'
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4.1-mini',
    'gpt-4.1',
    'o4-mini'
  ],
  anthropic: [
    'claude-3-5-haiku-latest',
    'claude-3-5-sonnet-latest',
    'claude-3-7-sonnet-latest',
    'claude-sonnet-4-5',
    'claude-opus-4-1'
  ],
  ollama: [
    'qwen2.5:7b',
    'qwen3:8b',
    'llama3.2:3b',
    'llama3.1:8b',
    'mistral:7b',
    'gemma2:9b'
  ]
}

const whisperModelOptions = ['tiny', 'base', 'small', 'medium', 'large-v3']
const whisperLanguageOptions = [
  { value: 'th', label: 'Thai' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: 'Auto detect' }
]
const maxPromptOptions = [2000, 4000, 8000, 12000]
const sessionTtlOptions = [8, 12, 24, 72, 168, 720]

export default function SystemSettingsPage() {
  const { t } = useTranslation()
  const { get, post, patch, delete: del, isLoading, error } = useApi()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [aiKeys, setAiKeys] = useState<AiProviderAccount[]>([])
  const [saveMessage, setSaveMessage] = useState('')
  const [aiKeyMessage, setAiKeyMessage] = useState('')
  const [aiKeyError, setAiKeyError] = useState('')
  const [aiKeyForm, setAiKeyForm] = useState({
    provider: 'gemini' as AiProviderAccount['provider'],
    accountName: '',
    label: '',
    model: '',
    baseUrl: '',
    organization: '',
    apiKey: '',
    isActive: true,
  })

  const fetchSettings = useCallback(async () => {
    const data = await get<SystemSettings>('/system-settings')
    if (data) {
      setSettings(data)
    }
  }, [get])

  const fetchAiKeys = useCallback(async () => {
    const data = await get<{ items: AiProviderAccount[] }>('/system-settings/ai-keys')
    if (data) {
      setAiKeys(data.items)
    }
  }, [get])

  useEffect(() => {
    fetchSettings()
    fetchAiKeys()
  }, [fetchSettings, fetchAiKeys])

  const toggleFallbackProvider = (provider: SystemSettings['ai']['generation']['provider']) => {
    if (!settings) {
      return
    }

    const current = settings.ai.generation.fallbackProviders
    const exists = current.includes(provider)
    const next = exists
      ? current.filter((item) => item !== provider)
      : [...current, provider].slice(0, 3)

    setValue('ai', {
      ...settings.ai,
      generation: {
        ...settings.ai.generation,
        fallbackProviders: next
      }
    })
  }

  const setValue = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    if (!settings) {
      return
    }

    setSettings({ ...settings, [key]: value })
  }

  const setWhisperEnabled = (enabled: boolean) => {
    if (!settings) {
      return
    }

    setSettings({
      ...settings,
      ai: {
        ...settings.ai,
        whisper: {
          ...settings.ai.whisper,
          enabled,
        },
      },
      integrations: {
        ...settings.integrations,
        whisperEnabled: enabled,
      },
    })
  }

  const setGenerationProvider = (provider: SystemSettings['ai']['generation']['provider']) => {
    if (!settings) {
      return
    }

    const modelOptions = providerModelOptions[provider]
    const previousOptions = providerModelOptions[settings.ai.generation.provider]
    const shouldSwitchModel =
      !settings.ai.generation.defaultModel ||
      previousOptions.includes(settings.ai.generation.defaultModel)

    setValue('ai', {
      ...settings.ai,
      generation: {
        ...settings.ai.generation,
        provider,
        defaultModel: shouldSwitchModel ? modelOptions[0] : settings.ai.generation.defaultModel,
        fallbackProviders: settings.ai.generation.fallbackProviders.filter((item) => item !== provider)
      }
    })
  }

  const setAiKeyProvider = (provider: AiProvider) => {
    const previousProvider = aiKeyForm.provider
    const previousModels = providerModelOptions[previousProvider]
    const nextModels = providerModelOptions[provider]
    const shouldSwitchModel = !aiKeyForm.model || previousModels.includes(aiKeyForm.model)
    const shouldSwitchBaseUrl = !aiKeyForm.baseUrl || aiKeyForm.baseUrl === providerBaseUrls[previousProvider]

    setAiKeyForm((prev) => ({
      ...prev,
      provider,
      model: shouldSwitchModel ? nextModels[0] : prev.model,
      baseUrl: shouldSwitchBaseUrl ? providerBaseUrls[provider] : prev.baseUrl
    }))
  }

  const onSave = async () => {
    if (!settings) {
      return
    }

    const updated = await patch<SystemSettings>('/system-settings', {
      ai: settings.ai,
      security: settings.security,
      notifications: settings.notifications,
      integrations: settings.integrations,
    })
    if (updated) {
      setSettings(updated)
      setSaveMessage(t('settings.saved'))
      window.setTimeout(() => setSaveMessage(''), 2200)
    }
  }

  const onCreateAiKey = async () => {
    setAiKeyError('')
    setAiKeyMessage('')

    const created = await post<AiProviderAccount>('/system-settings/ai-keys', aiKeyForm)
    if (!created) {
      setAiKeyError(t('settings.aiKeySaveFailed'))
      return
    }

    setAiKeyForm((prev) => ({ ...prev, apiKey: '', accountName: '', label: '' }))
    setAiKeyMessage(t('settings.aiKeySaved'))
    await fetchAiKeys()
  }

  const onActivateAiKey = async (id: string) => {
    setAiKeyError('')
    setAiKeyMessage('')
    const activated = await post<AiProviderAccount>(`/system-settings/ai-keys/${id}/activate`, {})
    if (!activated) {
      setAiKeyError(t('settings.aiKeyActivateFailed'))
      return
    }

    setAiKeyMessage(t('settings.aiKeyActivated'))
    await fetchAiKeys()
  }

  const onDeleteAiKey = async (id: string) => {
    setAiKeyError('')
    setAiKeyMessage('')
    const result = await del<unknown>(`/system-settings/ai-keys/${id}`)
    if (result === null) {
      setAiKeyError(t('settings.aiKeyDeleteFailed'))
      return
    }

    setAiKeyMessage(t('settings.aiKeyDeleted'))
    await fetchAiKeys()
  }

  const onTestAiKey = async (id: string) => {
    setAiKeyError('')
    setAiKeyMessage('')
    const result = await post<{ ok: boolean; preview?: string }>(`/system-settings/ai-keys/${id}/test`, {})
    if (!result || !result.ok) {
      setAiKeyError(t('settings.aiKeyTestFailed'))
      return
    }

    setAiKeyMessage(`${t('settings.aiKeyTestOk')}: ${(result.preview || '').slice(0, 120)}`)
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
                  {t('settings.generationProvider')}
                  <select
                    value={settings.ai.generation.provider}
                    onChange={(e) => setGenerationProvider(e.target.value as SystemSettings['ai']['generation']['provider'])}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.defaultGenerationModel')}
                  <input
                    list="generation-model-options"
                    value={settings.ai.generation.defaultModel}
                    onChange={(e) => setValue('ai', { ...settings.ai, generation: { ...settings.ai.generation, defaultModel: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                  <datalist id="generation-model-options">
                    {providerModelOptions[settings.ai.generation.provider].map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.maxPromptChars')}
                  <select
                    value={settings.ai.generation.maxPromptChars}
                    onChange={(e) => setValue('ai', { ...settings.ai, generation: { ...settings.ai.generation, maxPromptChars: Number(e.target.value) || 4000 } })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    {maxPromptOptions.map((value) => (
                      <option key={value} value={value}>{value.toLocaleString()}</option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2 rounded-md border border-gray-200 dark:border-slate-700 p-3">
                  <p className="text-sm font-medium text-gray-800 dark:text-slate-200 mb-2">{t('settings.fallbackProviders')}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">{t('settings.fallbackProvidersHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {providerOptions
                      .filter((item) => item !== settings.ai.generation.provider)
                      .map((provider) => {
                        const active = settings.ai.generation.fallbackProviders.includes(provider)
                        return (
                          <button
                            key={provider}
                            type="button"
                            onClick={() => toggleFallbackProvider(provider)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              active
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'border-gray-300 bg-white text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {provider}
                          </button>
                        )
                      })}
                  </div>
                </div>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.whisperModel')}
                  <select
                    value={settings.ai.whisper.model}
                    onChange={(e) => setValue('ai', { ...settings.ai, whisper: { ...settings.ai.whisper, model: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    {whisperModelOptions.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.whisperLanguage')}
                  <select
                    value={settings.ai.whisper.language}
                    onChange={(e) => setValue('ai', { ...settings.ai, whisper: { ...settings.ai.whisper, language: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    {whisperLanguageOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
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
                    onChange={(e) => setWhisperEnabled(e.target.checked)}
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
                  <select
                    value={settings.security.sessionTtlHours}
                    onChange={(e) => setValue('security', { ...settings.security, sessionTtlHours: Number(e.target.value) || 12 })}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    {sessionTtlOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
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
                    onChange={(e) => setWhisperEnabled(e.target.checked)}
                  />
                  {t('settings.whisperIntegrationEnabled')}
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('settings.aiKeysTitle')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.aiKeyProvider')}
                  <select
                    value={aiKeyForm.provider}
                    onChange={(e) => setAiKeyProvider(e.target.value as AiProvider)}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama</option>
                  </select>
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.aiKeyAccountName')}
                  <input
                    value={aiKeyForm.accountName}
                    onChange={(e) => setAiKeyForm((prev) => ({ ...prev, accountName: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.aiKeyLabel')}
                  <input
                    value={aiKeyForm.label}
                    onChange={(e) => setAiKeyForm((prev) => ({ ...prev, label: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.aiKeyModel')}
                  <input
                    list="ai-key-model-options"
                    value={aiKeyForm.model}
                    onChange={(e) => setAiKeyForm((prev) => ({ ...prev, model: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                  <datalist id="ai-key-model-options">
                    {providerModelOptions[aiKeyForm.provider].map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.aiKeyBaseUrl')}
                  <select
                    value={aiKeyForm.baseUrl}
                    onChange={(e) => setAiKeyForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    <option value="">Default</option>
                    {providerOptions.map((provider) => (
                      <option key={provider} value={providerBaseUrls[provider]}>{providerBaseUrls[provider]}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.aiKeyOrganization')}
                  <input
                    value={aiKeyForm.organization}
                    onChange={(e) => setAiKeyForm((prev) => ({ ...prev, organization: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <label className="md:col-span-2 text-sm text-gray-700 dark:text-slate-300">
                  {t('settings.aiKeySecret')}
                  <input
                    type="password"
                    value={aiKeyForm.apiKey}
                    onChange={(e) => setAiKeyForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={aiKeyForm.isActive}
                    onChange={(e) => setAiKeyForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  />
                  {t('settings.aiKeySetActiveOnSave')}
                </label>

                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={onCreateAiKey}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold"
                  >
                    {t('settings.aiKeySave')}
                  </button>
                </div>
              </div>

              {(aiKeyMessage || aiKeyError) && (
                <div className={`mt-4 rounded-md px-3 py-2 text-sm ${aiKeyError ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
                  {aiKeyError || aiKeyMessage}
                </div>
              )}

              <div className="mt-5 space-y-3">
                {aiKeys.map((item) => (
                  <div key={item.id} className="rounded-md border border-gray-200 dark:border-slate-700 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.accountName}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{item.provider} • {item.model || '-'} • {item.apiKeyMasked}</p>
                      </div>
                      {item.isActive && <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-1 text-xs font-semibold dark:bg-emerald-900/30 dark:text-emerald-300">active</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => onActivateAiKey(item.id)} className="rounded-md bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-semibold">{t('settings.aiKeySetActive')}</button>
                      <button type="button" onClick={() => onTestAiKey(item.id)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-300">{t('settings.aiKeyTest')}</button>
                      <button type="button" onClick={() => onDeleteAiKey(item.id)} className="rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-xs font-semibold">{t('settings.aiKeyDelete')}</button>
                    </div>
                  </div>
                ))}
                {!aiKeys.length && <p className="text-sm text-gray-500 dark:text-slate-400">{t('settings.aiKeyEmpty')}</p>}
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
