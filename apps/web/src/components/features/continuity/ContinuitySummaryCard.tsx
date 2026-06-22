import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectContinuitySummary } from '../../../types'

interface ContinuitySummaryCardProps {
  summary: ProjectContinuitySummary
  onClick?: () => void
  isActive?: boolean
}

export default function ContinuitySummaryCard({
  summary,
  onClick,
  isActive = false,
}: ContinuitySummaryCardProps) {
  const { t } = useTranslation()

  // Calculate risk level dynamically
  const riskColor = useMemo(() => {
    const ratio = summary.totalOverdueItems / Math.max(summary.totalOpenItems, 1)
    if (ratio >= 0.5) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    if (ratio >= 0.3) return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
    return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
  }, [summary])

  const riskBadgeColor = useMemo(() => {
    if (summary.riskLevel === 'critical') return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
    if (summary.riskLevel === 'high') return 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100'
    if (summary.riskLevel === 'medium') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
    return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
  }, [summary.riskLevel])

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${riskColor} ${
        isActive ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900' : 'hover:shadow-md'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
          {summary.projectName}
        </h3>
        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${riskBadgeColor}`}>
          {t(`continuity.riskLevel.${summary.riskLevel}`)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-sm text-gray-600 dark:text-slate-400">
            {t('continuity.open')}
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {summary.totalOpenItems}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-gray-600 dark:text-slate-400">
            {t('continuity.dueSoon')}
          </div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {summary.totalDueSoonItems}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-gray-600 dark:text-slate-400">
            {t('continuity.overdue')}
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {summary.totalOverdueItems}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">
        {t('continuity.lastUpdated')}: {new Date(summary.lastUpdated).toLocaleDateString()}
      </div>
    </div>
  )
}
