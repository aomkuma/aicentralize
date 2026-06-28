import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTenantStore } from '../../../stores/tenantStore'
import { useFeatureFlagStore } from '../../../stores/featureFlagStore'
import { useContinuity } from '../../../hooks/useContinuity'
import { useApi } from '../../../hooks/useApi'
import ContinuitySummaryCard from './ContinuitySummaryCard'
import OverdueByOwner from './OverdueByOwner'
import OverdueItemsList from './OverdueItemsList'

interface ContinuityDashboardProps {
  projectId?: string
}

type SavedMeeting = {
  id: string
  title: string
  summary: string
  sessionAt: string
  updatedAt: string
  minutes?: Array<{
    id?: string
    section: string
    content: string
  }>
  actionItems?: Array<{ id: string }>
}

export default function ContinuityDashboard({ projectId }: ContinuityDashboardProps) {
  const { t } = useTranslation()
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)
  const { get: getMeetings } = useApi()
  const {
    summary,
    overdueByOwner,
    overdueByProject,
    missingOwnerItems,
    isLoading,
    error,
    fetchSummary,
    fetchOverdueByOwner,
    fetchOverdueByProject,
    fetchMissingOwnerItems,
  } = useContinuity()

  const [selectedTab, setSelectedTab] = useState<'summary' | 'byOwner' | 'byProject' | 'missing'>(
    'summary'
  )
  const [savedMeetings, setSavedMeetings] = useState<SavedMeeting[]>([])

  // Check feature access
  const canAccessFull = canAccessFeature('CONTINUITY_FULL')
  const canAccessSummary = canAccessFeature('CONTINUITY_SUMMARY')

  // Determine which features to show
  const availableTabs = useMemo(() => {
    const tabs: typeof selectedTab[] = []
    if (canAccessSummary) tabs.push('summary')
    if (canAccessFull) {
      tabs.push('byOwner')
      tabs.push('byProject')
      tabs.push('missing')
    }
    return tabs
  }, [canAccessSummary, canAccessFull])

  // Fetch data on component mount or when projectId changes
  useEffect(() => {
    if (!canAccessSummary) return

    fetchSummary(projectId)
    if (canAccessFull) {
      fetchOverdueByOwner(projectId)
      fetchOverdueByProject()
      fetchMissingOwnerItems(projectId)
    }
  }, [projectId, canAccessSummary, canAccessFull])

  useEffect(() => {
    if (!projectId) {
      setSavedMeetings([])
      return
    }

    let mounted = true
    const scopedProjectId = projectId

    async function fetchSavedMeetings() {
      const data = await getMeetings<SavedMeeting[]>(`/meetings?projectId=${encodeURIComponent(scopedProjectId)}`)
      if (mounted && Array.isArray(data)) {
        setSavedMeetings(data.slice(0, 5))
      }
    }

    fetchSavedMeetings()

    return () => {
      mounted = false
    }
  }, [getMeetings, projectId])

  // Reset to available tab if current is not accessible
  useEffect(() => {
    if (!availableTabs.includes(selectedTab)) {
      setSelectedTab(availableTabs[0] || 'summary')
    }
  }, [availableTabs, selectedTab])

  if (!canAccessFeature('CONTINUITY_SUMMARY')) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-slate-400">
          {t('features.notAvailable')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('continuity.title')}
        </h2>
        <p className="text-gray-600 dark:text-slate-400">
          {t('continuity.description')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-700">
        {availableTabs.includes('summary') && (
          <button
            onClick={() => setSelectedTab('summary')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'summary'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.summary')}
          </button>
        )}
        {availableTabs.includes('byOwner') && (
          <button
            onClick={() => setSelectedTab('byOwner')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'byOwner'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.byOwner')}
          </button>
        )}
        {availableTabs.includes('byProject') && (
          <button
            onClick={() => setSelectedTab('byProject')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'byProject'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.byProject')}
          </button>
        )}
        {availableTabs.includes('missing') && (
          <button
            onClick={() => setSelectedTab('missing')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'missing'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.missing')}
          </button>
        )}
      </div>

      {/* Content */}
      <div>
        {selectedTab === 'summary' && summary && (
          <ContinuitySummaryCard summary={summary} />
        )}

        {selectedTab === 'summary' && !summary && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {isLoading
                ? t('common.loading')
                : error?.message || t('continuity.noSummary', { defaultValue: 'No continuity summary is available for this project yet.' })}
            </p>
          </div>
        )}

        {selectedTab === 'summary' && projectId && (
          <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('continuity.savedMeetings', { defaultValue: 'Saved meetings' })}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  {t('continuity.savedMeetingsDesc', { defaultValue: 'Recently saved meeting minutes for this project.' })}
                </p>
              </div>
              <Link
                to="/meetings/history"
                className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                {t('meetingHistory.navLabel', { defaultValue: 'Minute History' })}
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {savedMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="rounded-lg border border-gray-200 p-4 dark:border-slate-700"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {meeting.title}
                      </h4>
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        {new Date(meeting.sessionAt).toLocaleString()}
                      </p>
                    </div>
                    <Link
                      to={`/meetings/history/${meeting.id}`}
                      className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {t('continuity.openMinutes', { defaultValue: 'Open minutes' })}
                    </Link>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-slate-300">
                    {meeting.summary}
                  </p>
                  {meeting.minutes?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {meeting.minutes.slice(0, 4).map((minute, index) => (
                        <span
                          key={minute.id || `${meeting.id}-${index}`}
                          className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        >
                          {minute.section}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}

              {!savedMeetings.length && (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  {t('continuity.noSavedMeetings', { defaultValue: 'No saved meetings found for this project yet.' })}
                </div>
              )}
            </div>
          </section>
        )}

        {selectedTab === 'byOwner' && (
          <OverdueByOwner data={overdueByOwner} isLoading={isLoading} />
        )}

        {selectedTab === 'byProject' && (
          <div className="space-y-3">
            {overdueByProject.map((proj) => (
              <div
                key={proj.projectId}
                className="p-4 bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600"
              >
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  {proj.projectName}
                </h4>
                <OverdueItemsList
                  items={proj.items || []}
                  maxHeight="max-h-48"
                />
              </div>
            ))}
            {overdueByProject.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-slate-400">
                  {t('continuity.noProjectOverdue')}
                </p>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'missing' && (
          <div className="space-y-2">
            {missingOwnerItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {item.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                      {t('continuity.type')}: {item.type}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 rounded whitespace-nowrap">
                    {t('continuity.missingInfo')}
                  </span>
                </div>
              </div>
            ))}
            {missingOwnerItems.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-slate-400">
                  {t('continuity.noMissingInfo')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
