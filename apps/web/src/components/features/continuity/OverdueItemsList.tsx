import { useTranslation } from 'react-i18next'
import type { OverdueItem } from '../../../types'

interface OverdueItemsListProps {
  items: OverdueItem[]
  title?: string
  isLoading?: boolean
  maxHeight?: string
  onItemClick?: (itemId: string) => void
}

export default function OverdueItemsList({
  items,
  title = 'Overdue Items',
  isLoading = false,
  maxHeight = 'max-h-96',
  onItemClick,
}: OverdueItemsListProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-slate-400">
          {t('continuity.noOverdueItems')}
        </p>
      </div>
    )
  }

  return (
    <div className={`${maxHeight} overflow-y-auto`}>
      {onItemClick && (
        <p className="mb-2 text-xs text-blue-700 dark:text-blue-300">
          {t('continuity.overdueItemClickHint')}
        </p>
      )}
      <div className="space-y-2">
        {items.map((item) => {
          const content = (
            <>
              <div className="flex justify-between items-start gap-2 mb-1">
                <h4 className="font-medium text-gray-900 dark:text-white truncate">
                  {item.title}
                </h4>
                <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 whitespace-nowrap">
                  {item.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-400">
                {item.dueDate && (
                  <div>
                    <span className="font-medium">{t('continuity.dueDate')}:</span>{' '}
                    {new Date(item.dueDate).toLocaleDateString()}
                  </div>
                )}
                {item.owner && (
                  <div>
                    <span className="font-medium">{t('continuity.owner')}:</span>{' '}
                    {item.owner.name}
                  </div>
                )}
              </div>
            </>
          )

          if (onItemClick) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemClick(item.id)}
                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-blue-500 dark:hover:bg-slate-600"
              >
                {content}
              </button>
            )
          }

          return (
            <div
              key={item.id}
              className="p-3 bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 hover:shadow-md transition-shadow"
            >
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
