import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFeatureFlagStore } from '../../../stores/featureFlagStore'
import { useAiRunLogs } from '../../../hooks/useAiRunLogs'
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

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [filterOperation, setFilterOperation] = useState<AiRunOperation | 'ALL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<AiRunStatus | 'ALL'>('ALL')
  const [limit, setLimit] = useState(50)

  // Check feature access
  const canAccess = canAccessFeature('AI_TRACE_PANEL')

  // Fetch logs on mount or when filters change
  useEffect(() => {
    if (!canAccess) return

    fetchLogs({
      operation: filterOperation === 'ALL' ? undefined : filterOperation,
      status: filterStatus === 'ALL' ? undefined : filterStatus,
      projectId,
      meetingId,
      limit,
    })
  }, [filterOperation, filterStatus, projectId, meetingId, limit, canAccess])

  // Fetch log detail when selected
  useEffect(() => {
    if (selectedLogId && canAccess) {
      fetchLogDetail(selectedLogId)
    }
  }, [selectedLogId, canAccess])

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
        </div>

        {/* Filters */}
        <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg space-y-3">
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
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                {t('aiTrace.noLogs')}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <AiRunLogCard
                key={log.id}
                log={log}
                onClick={() => setSelectedLogId(log.id)}
                isActive={selectedLogId === log.id}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Log Detail */}
      <div className="lg:col-span-2">
        <AiTraceDetail log={currentLog || null} />
      </div>
    </div>
  )
}
