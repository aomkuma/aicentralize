import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OverdueByOwner } from '../../../types'
import OverdueItemsList from './OverdueItemsList'

interface OverdueByOwnerProps {
  data: OverdueByOwner[]
  isLoading?: boolean
}

export default function OverdueByOwner({ data, isLoading = false }: OverdueByOwnerProps) {
  const { t } = useTranslation()
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-slate-400">
          {t('continuity.noOverdueByOwner')}
        </p>
      </div>
    )
  }

  // Sort by count descending
  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-3">
      {sorted.map((owner) => (
        <div
          key={owner.ownerId || 'unassigned'}
          className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden"
        >
          <button
            onClick={() =>
              setExpandedOwnerId(
                expandedOwnerId === owner.ownerId ? null : owner.ownerId || null
              )
            }
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
          >
            <div className="text-left">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {owner.ownerName || t('continuity.unassigned')}
              </h4>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {owner.ownerEmail}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 rounded-full font-medium">
                {owner.count} {t('continuity.overdue')}
              </span>
              <svg
                className={`w-5 h-5 text-gray-600 dark:text-slate-400 transition-transform ${
                  expandedOwnerId === owner.ownerId ? 'transform rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </div>
          </button>

          {expandedOwnerId === owner.ownerId && (
            <div className="px-4 pb-4 border-t border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800">
              <OverdueItemsList
                items={owner.items || []}
                title={`${owner.ownerName}'s Overdue Items`}
                maxHeight="max-h-64"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
