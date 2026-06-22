import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTenantStore } from '../../../stores/tenantStore'
import { useFeatureFlagStore } from '../../../stores/featureFlagStore'
import { useContinuity } from '../../../hooks/useContinuity'
import ContinuitySummaryCard from './ContinuitySummaryCard'
import OverdueByOwner from './OverdueByOwner'
import OverdueItemsList from './OverdueItemsList'

interface ContinuityDashboardProps {
  projectId?: string
}

export default function ContinuityDashboard({ projectId }: ContinuityDashboardProps) {
  const { t } = useTranslation()
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)
  const {
    summary,
    overdueByOwner,
    overdueByProject,
    missingOwnerItems,
    isLoading,
    fetchSummary,
    fetchOverdueByOwner,
    fetchOverdueByProject,
    fetchMissingOwnerItems,
  } = useContinuity()

  const [selectedTab, setSelectedTab] = useState<'summary' | 'byOwner' | 'byProject' | 'missing'>(
    'summary'
  )

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
