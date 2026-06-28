import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTenantStore } from '../../../stores/tenantStore'
import { useFeatureFlagStore } from '../../../stores/featureFlagStore'
import { useReminders } from '../../../hooks/useReminders'
import ReminderDigestCard from './ReminderDigestCard'
import type { ReminderDigest, ReminderDigestDetail } from '../../../types'

interface ReminderOperationsProps {
  projectId?: string
}

export default function ReminderOperations({ projectId }: ReminderOperationsProps) {
  const { t } = useTranslation()
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)
  const { digests, currentDigest, isLoading, fetchDigests, fetchDigestDetail } =
    useReminders()

  const [selectedDigestId, setSelectedDigestId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{
    start: string
    end: string
  }>(() => {
    const now = new Date()
    const end = now.toISOString().split('T')[0]
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
    return { start, end }
  })
  const [detailError, setDetailError] = useState('')

  // Check feature access
  const canAccessReminders = canAccessFeature('REMINDERS_ESCALATION')

  // Fetch digests on mount or when projectId changes
  useEffect(() => {
    if (!canAccessReminders) return
    fetchDigests(projectId, undefined, dateRange)
  }, [projectId, canAccessReminders])

  // Fetch digest detail when selected
  useEffect(() => {
    if (selectedDigestId && canAccessReminders) {
      setDetailError('')
      fetchDigestDetail(selectedDigestId).then((data) => {
        if (!data) {
          setDetailError(t('reminders.detailLoadFailed', { defaultValue: 'Unable to load digest details.' }))
        }
      })
    }
  }, [selectedDigestId, canAccessReminders, fetchDigestDetail, t])

  const handleApplyDateRange = async () => {
    setSelectedDigestId(null)
    setDetailError('')
    await fetchDigests(projectId, undefined, dateRange)
  }

  if (!canAccessReminders) {
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
      {/* Left: Digest List */}
      <div className="lg:col-span-1">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t('reminders.title')}
          </h2>
          <p className="text-gray-600 dark:text-slate-400 text-sm">
            {t('reminders.description')}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">
            {t('reminders.helpText', { defaultValue: 'Use this page to inspect reminder digest snapshots, identify overdue follow-ups, and open the related project or minutes.' })}
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            {t('reminders.dateRange')}
          </label>
          <div className="space-y-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange({ ...dateRange, start: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded text-sm"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange({ ...dateRange, end: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded text-sm"
            />
            <button
              type="button"
              onClick={handleApplyDateRange}
              className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
            >
              {t('reminders.applyDateRange', { defaultValue: 'Apply date range' })}
            </button>
          </div>
        </div>

        {/* Digest List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : digests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                {t('reminders.noDigests')}
              </p>
            </div>
          ) : (
            digests.map((digest) => (
              <ReminderDigestCard
                key={digest.id}
                digest={digest}
                onClick={() => setSelectedDigestId(digest.id)}
                isActive={selectedDigestId === digest.id}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Digest Detail */}
      <div className="lg:col-span-2">
        {selectedDigestId && currentDigest?.id === selectedDigestId ? (
          <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-6">
            {/* Header */}
            <div className="mb-6 pb-6 border-b border-gray-200 dark:border-slate-600">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {t('reminders.digestDetail')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {new Date(currentDigest.windowStart).toLocaleDateString()} -{' '}
                {new Date(currentDigest.windowEnd).toLocaleDateString()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/continuity/${currentDigest.projectId}`}
                  className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                >
                  {t('reminders.openContinuity', { defaultValue: 'Open continuity' })}
                </Link>
                {currentDigest.project?.name && (
                  <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {currentDigest.project.code ? `${currentDigest.project.code} - ` : ''}{currentDigest.project.name}
                  </span>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {t('reminders.totalOpen')}
                </div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {currentDigest.totalOpen}
                </div>
              </div>
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {t('reminders.totalDueSoon')}
                </div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {currentDigest.totalDueSoon}
                </div>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded">
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {t('reminders.totalOverdue')}
                </div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {currentDigest.totalOverdue}
                </div>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {t('reminders.totalEscalated')}
                </div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {currentDigest.totalEscalated}
                </div>
              </div>
            </div>

            {/* Overdue by Owner */}
            {currentDigest.overdueByOwner && currentDigest.overdueByOwner.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  {t('reminders.overdueByOwner')}
                </h4>
                <div className="space-y-2">
                  {currentDigest.overdueByOwner.map((owner) => (
                    <div
                      key={owner.ownerId || 'unassigned'}
                      className="p-3 bg-gray-50 dark:bg-slate-600 rounded flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {owner.ownerName || t('reminders.unassigned')}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {owner.ownerEmail}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 rounded-full font-medium">
                        {owner.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items */}
            {currentDigest.items && currentDigest.items.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  {t('reminders.items')}
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {currentDigest.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-gray-50 dark:bg-slate-600 rounded"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {item.title}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            {item.status}
                            {item.dueDate ? ` · ${t('reminders.dueDate', { defaultValue: 'Due' })}: ${new Date(item.dueDate).toLocaleDateString()}` : ''}
                          </p>
                          {(item.ownerName || item.ownerEmail || item.meetingTitle) && (
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                              {item.ownerName || item.ownerEmail || t('reminders.unassigned')}
                              {item.meetingTitle ? ` · ${item.meetingTitle}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {item.severity && (
                            <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-200">
                              {item.severity}
                            </span>
                          )}
                          {item.meetingId && (
                            <Link
                              to={`/meetings/history/${item.meetingId}`}
                              className="rounded bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              {t('reminders.openMinutes', { defaultValue: 'Open minutes' })}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!currentDigest.items || currentDigest.items.length === 0) && (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-slate-600 dark:text-slate-400">
                {t('reminders.noDigestItems', { defaultValue: 'This digest has no due or overdue action items.' })}
              </div>
            )}
          </div>
        ) : selectedDigestId && isLoading ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <p className="text-gray-500 dark:text-slate-400">
              {t('common.loading')}
            </p>
          </div>
        ) : selectedDigestId && detailError ? (
          <div className="text-center py-12 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-red-600 dark:text-red-300">
              {detailError}
            </p>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <p className="text-gray-500 dark:text-slate-400">
              {t('reminders.selectDigest')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
