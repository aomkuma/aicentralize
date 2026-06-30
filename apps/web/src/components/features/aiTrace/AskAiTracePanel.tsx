import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFeatureFlagStore } from '../../../stores/featureFlagStore'
import { useAiRunLogs } from '../../../hooks/useAiRunLogs'
import { useAskAiQueryLogs } from '../../../hooks/useAskAiQueryLogs'
import AiRunLogCard from './AiRunLogCard'
import AiTraceDetail from './AiTraceDetail'
import type { AiRunOperation, AiRunStatus } from '../../../types'

interface AskAiTracePanelProps {
  projectId?: string
  meetingId?: string
}

export default function AskAiTracePanel({
  projectId,
  meetingId,
}: AskAiTracePanelProps) {
  const { t } = useTranslation()
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)
  const { logs, currentLog, isLoading, fetchLogs, fetchLogDetail } = useAiRunLogs()
  const {
    logs: queryLogs,
    currentLog: currentQueryLog,
    isLoading: isQueryLoading,
    fetchLogs: fetchQueryLogs,
    fetchLogDetail: fetchQueryDetail,
  } = useAskAiQueryLogs()

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'runs' | 'conversations'>('runs')
  const [filterOperation, setFilterOperation] = useState<AiRunOperation | 'ALL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<AiRunStatus | 'ALL'>('ALL')
  const [limit, setLimit] = useState(50)
  const [copyNotice, setCopyNotice] = useState('')
  const copyNoticeTimerRef = useRef<number | null>(null)

  // Check feature access
  const canAccess = canAccessFeature('AI_TRACE_PANEL')

  // Fetch logs on mount or when filters change
  useEffect(() => {
    if (!canAccess) return

    if (activeTab !== 'runs') return

    fetchLogs({
      operation: filterOperation === 'ALL' ? undefined : filterOperation,
      status: filterStatus === 'ALL' ? undefined : filterStatus,
      projectId,
      meetingId,
      pageSize: limit,
    })
  }, [activeTab, filterOperation, filterStatus, projectId, meetingId, limit, canAccess])

  useEffect(() => {
    if (!canAccess) return

    if (activeTab !== 'conversations') return

    fetchQueryLogs({
      projectId,
      meetingId,
      pageSize: limit,
    })
  }, [activeTab, projectId, meetingId, limit, canAccess])

  // Fetch log detail when selected
  useEffect(() => {
    if (activeTab === 'runs' && selectedLogId && canAccess) {
      fetchLogDetail(selectedLogId)
    }
  }, [activeTab, selectedLogId, canAccess])

  useEffect(() => {
    if (activeTab === 'conversations' && selectedQueryId && canAccess) {
      fetchQueryDetail(selectedQueryId)
    }
  }, [activeTab, selectedQueryId, canAccess])

  useEffect(() => {
    setCopyNotice('')
  }, [selectedQueryId])

  useEffect(() => {
    return () => {
      if (copyNoticeTimerRef.current) {
        window.clearTimeout(copyNoticeTimerRef.current)
      }
    }
  }, [])

  const copyText = async (value: string) => {
    const text = (value || '').trim()
    if (!text) {
      return false
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }

    const temp = document.createElement('textarea')
    temp.value = text
    temp.setAttribute('readonly', '')
    temp.style.position = 'absolute'
    temp.style.left = '-9999px'
    document.body.appendChild(temp)
    temp.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(temp)
    return copied
  }

  const copyConversationAnswer = async () => {
    if (!currentQueryLog?.answer) {
      return
    }

    try {
      const copied = await copyText(currentQueryLog.answer)
      setCopyNotice(copied ? t('aiTrace.copySuccess') : t('aiTrace.copyFailed'))
    } catch {
      setCopyNotice(t('aiTrace.copyFailed'))
    }

    if (copyNoticeTimerRef.current) {
      window.clearTimeout(copyNoticeTimerRef.current)
    }
    copyNoticeTimerRef.current = window.setTimeout(() => {
      setCopyNotice('')
      copyNoticeTimerRef.current = null
    }, 2200)
  }

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterOperation !== 'ALL' && log.operation !== filterOperation) return false
      if (filterStatus !== 'ALL' && log.status !== filterStatus) return false
      return true
    })
  }, [logs, filterOperation, filterStatus])

  if (!canAccess) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-slate-400">
          {t('features.notAvailable')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Log List */}
      <div className="lg:col-span-1">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t('aiTrace.title')}
          </h2>
          <p className="text-gray-600 dark:text-slate-400 text-sm">
            {t('aiTrace.description')}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('runs')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'runs'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t('aiTrace.tabs.runLogs')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('conversations')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'conversations'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t('aiTrace.tabs.conversations')}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg space-y-3">
          {activeTab === 'runs' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  {t('aiTrace.operation')}
                </label>
                <select
                  value={filterOperation}
                  onChange={(e) => setFilterOperation(e.target.value as AiRunOperation | 'ALL')}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded text-xs"
                >
                  <option value="ALL">{t('aiTrace.allOperations')}</option>
                  <option value="MINUTE_EXTRACTION">
                    {t('aiTrace.operations.minute_extraction')}
                  </option>
                  <option value="RETRIEVAL_QUERY">
                    {t('aiTrace.operations.retrieval_query')}
                  </option>
                  <option value="ASK_AI_ANSWER">
                    {t('aiTrace.operations.ask_ai_answer')}
                  </option>
                  <option value="REMINDER_RUN">
                    {t('aiTrace.operations.reminder_run')}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  {t('aiTrace.status')}
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as AiRunStatus | 'ALL')}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded text-xs"
                >
                  <option value="ALL">{t('aiTrace.allStatuses')}</option>
                  <option value="SUCCESS">{t('aiTrace.success')}</option>
                  <option value="FAILED">{t('aiTrace.failed')}</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              {t('aiTrace.limit')}
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="w-full px-2 py-1 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded text-xs"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>

        {/* Log List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activeTab === 'runs' && isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : activeTab === 'runs' && filteredLogs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                {t('aiTrace.noLogs')}
              </p>
            </div>
          ) : activeTab === 'runs' ? (
            filteredLogs.map((log) => (
              <AiRunLogCard
                key={log.id}
                log={log}
                onClick={() => setSelectedLogId(log.id)}
                isActive={selectedLogId === log.id}
              />
            ))
          ) : isQueryLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : queryLogs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                {t('aiTrace.noConversations')}
              </p>
            </div>
          ) : (
            queryLogs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelectedQueryId(log.id)}
                className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                  selectedQueryId === log.id
                    ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 border-blue-500'
                    : 'border-gray-200 dark:border-slate-700 hover:shadow-md'
                } bg-white dark:bg-slate-800`}
              >
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">
                  {new Date(log.createdAt).toLocaleString()}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                  {log.question}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Log Detail */}
      <div className="lg:col-span-2">
        {activeTab === 'runs' ? (
          <AiTraceDetail log={currentLog || null} />
        ) : !currentQueryLog ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <p className="text-gray-500 dark:text-slate-400">{t('aiTrace.selectConversation')}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-6 space-y-6">
            <div className="pb-6 border-b border-gray-200 dark:border-slate-600">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {t('aiTrace.conversationHistory')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {new Date(currentQueryLog.createdAt).toLocaleString()}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">{t('aiTrace.question')}</h4>
              <div className="rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 p-3 text-sm text-gray-900 dark:text-slate-100 whitespace-pre-wrap break-words">
                {currentQueryLog.question}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="font-semibold text-gray-900 dark:text-white">{t('aiTrace.answer')}</h4>
                <button
                  type="button"
                  onClick={() => void copyConversationAnswer()}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {t('aiTrace.copyAnswer')}
                </button>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 p-3 text-sm text-gray-900 dark:text-slate-100 whitespace-pre-wrap break-words">
                {currentQueryLog.answer}
              </div>
              <p className="mt-2 min-h-[1.2em] text-xs text-gray-500 dark:text-slate-400">{copyNotice}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
