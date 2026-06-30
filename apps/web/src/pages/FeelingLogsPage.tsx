import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import type {
  FeelingLog,
  FeelingLogInboxItem,
  TenantMembership,
  User,
} from '../types'

const EMOJI_OPTIONS = ['😊', '😔', '😤', '😰', '🥲', '💪', '🌧️', '✨', '😐', '😴']

type TenantMemberRow = TenantMembership & {
  user: Pick<User, 'id' | 'name' | 'email'>
}

type FeelingLogInboxResponse = {
  recentInsights: FeelingLogInboxItem[]
  frequentMentions: Array<{
    userId: string
    name: string
    email?: string
    count: number
  }>
  windowStart: string
  windowEnd: string
}

function riskBadgeClass(risk?: string | null) {
  if (risk === 'HIGH') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
  }
  if (risk === 'MEDIUM') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
  }
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
}

function formatWhen(value: string, locale: string) {
  return new Date(value).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function FeelingLogsPage() {
  const { t, i18n } = useTranslation()
  const currentUser = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const setCurrentTenant = useTenantStore((state) => state.setCurrentTenant)
  const { get, post, isLoading, error } = useApi()

  const [memberships, setMemberships] = useState<TenantMembership[]>([])
  const [tenantId, setTenantId] = useState('')
  const [members, setMembers] = useState<TenantMemberRow[]>([])
  const [logs, setLogs] = useState<FeelingLog[]>([])
  const [inbox, setInbox] = useState<FeelingLogInboxResponse | null>(null)
  const [content, setContent] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [mentionedUsers, setMentionedUsers] = useState<Array<Pick<User, 'id' | 'name' | 'email'>>>([])
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [activeTab, setActiveTab] = useState<'journal' | 'insights'>('journal')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const activeMembership = useMemo(
    () => memberships.find((membership) => membership.tenantId === tenantId) ?? memberships[0],
    [memberships, tenantId],
  )

  const canViewInsights = activeMembership?.role === 'TENANT_ADMIN' || activeMembership?.role === 'MANAGER'

  const mentionSuggestions = useMemo(() => {
    const selectedIds = new Set(mentionedUsers.map((user) => user.id))
    const query = mentionQuery.trim().toLowerCase()
    return members
      .map((member) => member.user)
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => !selectedIds.has(user.id))
      .filter((user) => {
        if (!query) {
          return true
        }
        return user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
      })
      .slice(0, 8)
  }, [members, mentionQuery, mentionedUsers, currentUser?.id])

  const loadMemberships = useCallback(async () => {
    const data = await get<TenantMembership[]>('/tenants/me')
    if (!Array.isArray(data) || data.length === 0) {
      return
    }

    setMemberships(data)
    const preferred = data.find((membership) => membership.tenantId === currentTenant?.id) ?? data[0]
    setTenantId((current) => current || preferred.tenantId)
    if (preferred.tenant && preferred.tenantId !== currentTenant?.id) {
      setCurrentTenant(preferred.tenant, preferred)
    }
  }, [get, currentTenant?.id, setCurrentTenant])

  const loadMembers = useCallback(async () => {
    if (!tenantId) {
      setMembers([])
      return
    }

    const data = await get<TenantMemberRow[]>(`/tenants/${tenantId}/members`)
    if (Array.isArray(data)) {
      setMembers(data.filter((row): row is TenantMemberRow => Boolean(row.user)))
    }
  }, [get, tenantId])

  const loadLogs = useCallback(async () => {
    if (!tenantId) {
      setLogs([])
      return
    }

    const data = await get<{ logs: FeelingLog[] }>(`/tenants/${tenantId}/feeling-logs/me`)
    if (data?.logs) {
      setLogs(data.logs)
    }
  }, [get, tenantId])

  const loadInbox = useCallback(async () => {
    if (!tenantId || !canViewInsights) {
      setInbox(null)
      return
    }

    const data = await get<FeelingLogInboxResponse>(`/tenants/${tenantId}/feeling-logs/inbox`)
    if (data) {
      setInbox(data)
    }
  }, [get, tenantId, canViewInsights])

  useEffect(() => {
    void loadMemberships()
  }, [loadMemberships])

  useEffect(() => {
    void loadMembers()
    void loadLogs()
    void loadInbox()
  }, [loadMembers, loadLogs, loadInbox])

  useEffect(() => {
    if (!canViewInsights && activeTab === 'insights') {
      setActiveTab('journal')
    }
  }, [canViewInsights, activeTab])

  const handleContentChange = (value: string) => {
    setContent(value)
    const caret = textareaRef.current?.selectionStart ?? value.length
    const beforeCaret = value.slice(0, caret)
    const match = beforeCaret.match(/@([^\s@]*)$/)
    if (match) {
      setMentionQuery(match[1] ?? '')
      setShowMentionMenu(true)
      return
    }
    setShowMentionMenu(false)
    setMentionQuery('')
  }

  const addMention = (user: Pick<User, 'id' | 'name' | 'email'>) => {
    if (mentionedUsers.some((item) => item.id === user.id)) {
      return
    }

    setMentionedUsers((current) => [...current, user])
    setContent((current) => {
      const replaced = current.replace(/@([^\s@]*)$/, `@${user.name} `)
      return replaced === current ? `${current}${current.endsWith(' ') || !current ? '' : ' '}@${user.name} ` : replaced
    })
    setShowMentionMenu(false)
    setMentionQuery('')
    textareaRef.current?.focus()
  }

  const removeMention = (userId: string) => {
    setMentionedUsers((current) => current.filter((user) => user.id !== userId))
  }

  const handleSave = async () => {
    const cleanContent = content.trim()
    if (!tenantId) {
      setNotice(t('feelingLogs.validationTenant'))
      return
    }
    if (!cleanContent) {
      setNotice(t('feelingLogs.validationContent'))
      return
    }

    setNotice('')
    const response = await post<{ log: FeelingLog | null }>(`/tenants/${tenantId}/feeling-logs`, {
      content: cleanContent,
      emoji,
      mentionedUserIds: mentionedUsers.map((user) => user.id),
    })

    if (response?.log) {
      setContent('')
      setEmoji(null)
      setMentionedUsers([])
      setNotice(t('feelingLogs.savedPending'))
      await loadLogs()
      if (canViewInsights) {
        await loadInbox()
      }
    }
  }

  const personalAnalysis = (log: FeelingLog) => log.analyses.find((item) => item.audience === 'PERSONAL')

  return (
    <Layout currentTenantName={activeMembership?.tenant?.name}>
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
            Rubjob
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {t('feelingLogs.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            {t('feelingLogs.description')}
          </p>
          <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
            {t('feelingLogs.batchScheduleNote')}
          </p>
        </div>

        {memberships.length > 1 && (
          <label className="mb-4 block text-sm text-gray-700 dark:text-slate-300">
            {t('feelingLogs.organization')}
            <select
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            >
              {memberships.map((membership) => (
                <option key={membership.tenantId} value={membership.tenantId}>
                  {membership.tenant?.name ?? membership.tenantId}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('journal')}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'journal' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
          >
            {t('feelingLogs.tabJournal')}
          </button>
          {canViewInsights && (
            <button
              type="button"
              onClick={() => setActiveTab('insights')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'insights' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
            >
              {t('feelingLogs.tabInsights')}
            </button>
          )}
        </div>

        {(notice || error?.message) && (
          <div className={`mb-4 rounded-md px-3 py-2 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
            {error?.message || notice}
          </div>
        )}

        {activeTab === 'journal' ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('feelingLogs.newEntry')}</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{t('feelingLogs.privacyNote')}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setEmoji((current) => (current === option ? null : option))}
                    className={`h-10 w-10 rounded-full text-xl ${emoji === option ? 'bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-900/40' : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
                    aria-label={option}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <div className="relative mt-4">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(event) => handleContentChange(event.target.value)}
                  rows={6}
                  placeholder={t('feelingLogs.placeholder')}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                {showMentionMenu && mentionSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {mentionSuggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => addMention(user)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{user.name}</span>
                        <span className="text-xs text-gray-500 dark:text-slate-400">{user.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {mentionedUsers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mentionedUsers.map((user) => (
                    <span
                      key={user.id}
                      className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                    >
                      @{user.name}
                      <button
                        type="button"
                        onClick={() => removeMention(user.id)}
                        className="text-blue-700 dark:text-blue-200"
                        aria-label={t('feelingLogs.removeMention')}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-500 dark:text-slate-400">{t('feelingLogs.mentionHint')}</p>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleSave()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isLoading ? t('common.loading') : t('feelingLogs.save')}
                </button>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('feelingLogs.history')}</h2>
              {logs.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-slate-400">{t('feelingLogs.empty')}</p>
              ) : (
                logs.map((log) => {
                  const analysis = personalAnalysis(log)
                  return (
                    <article key={log.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {log.emoji && <span className="text-2xl">{log.emoji}</span>}
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatWhen(log.createdAt, i18n.language)}
                          </p>
                        </div>
                        {analysis?.riskLevel && (
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${riskBadgeClass(analysis.riskLevel)}`}>
                            {analysis.riskLevel}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800 dark:text-slate-200">{log.content}</p>
                      {log.mentions.length > 0 && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                          {t('feelingLogs.mentions')}: {log.mentions.map((mention) => mention.mentionLabel).join(', ')}
                        </p>
                      )}
                      {!log.processedAt && (
                        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                          {t('feelingLogs.pendingAnalysis')}
                        </div>
                      )}
                      {analysis && (
                        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{analysis.title}</p>
                          <p className="mt-2 text-sm text-blue-900/90 dark:text-blue-100/90">{analysis.summary}</p>
                          <p className="mt-2 text-sm text-blue-800/90 dark:text-blue-100/80">{analysis.interpretation}</p>
                          {analysis.recommendation && (
                            <p className="mt-2 text-sm font-medium text-blue-900 dark:text-blue-100">
                              {t('feelingLogs.recommendation')}: {analysis.recommendation}
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
              {t('feelingLogs.insightsPrivacy')}
            </section>

            {inbox?.frequentMentions && inbox.frequentMentions.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('feelingLogs.frequentMentions')}</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{t('feelingLogs.frequentMentionsHelp')}</p>
                <ul className="mt-4 space-y-2">
                  {inbox.frequentMentions.map((item) => (
                    <li key={item.userId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                      <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {t('feelingLogs.mentionCount', { count: item.count })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('feelingLogs.recentInsights')}</h2>
              {!inbox?.recentInsights?.length ? (
                <p className="text-sm text-gray-500 dark:text-slate-400">{t('feelingLogs.insightsEmpty')}</p>
              ) : (
                inbox.recentInsights.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                          {formatWhen(item.createdAt, i18n.language)}
                          {item.emoji ? ` · ${item.emoji}` : ''}
                        </p>
                      </div>
                      {item.riskLevel && (
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${riskBadgeClass(item.riskLevel)}`}>
                          {item.riskLevel}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm text-gray-800 dark:text-slate-200">{item.summary}</p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">{item.interpretation}</p>
                    {item.mentionedPeople.length > 0 && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                        {t('feelingLogs.relatedPeople')}: {item.mentionedPeople.join(', ')}
                      </p>
                    )}
                    {item.targetUser && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                        {t('feelingLogs.mentionTarget')}: {item.targetUser.name}
                      </p>
                    )}
                    {item.recommendation && (
                      <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
                        {t('feelingLogs.recommendation')}: {item.recommendation}
                      </p>
                    )}
                  </article>
                ))
              )}
            </section>
          </div>
        )}
      </div>
    </Layout>
  )
}
