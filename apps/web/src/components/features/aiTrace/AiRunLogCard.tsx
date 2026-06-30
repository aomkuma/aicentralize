import { useTranslation } from 'react-i18next'
import type { AiRunLog } from '../../../types'

interface AiRunLogCardProps {
  log: AiRunLog
  onClick?: () => void
  isActive?: boolean
}

export default function AiRunLogCard({ log, onClick, isActive = false }: AiRunLogCardProps) {
  const { t } = useTranslation()

  const statusColor =
    log.status === 'SUCCESS'
      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'

  const statusBadgeColor =
    log.status === 'SUCCESS'
      ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
      : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'

  const operationLabel = t(`aiTrace.operations.${log.operation.toLowerCase()}`)

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${statusColor} ${
        isActive ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900' : 'hover:shadow-md'
      }`}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 dark:text-white">
            {operationLabel}
          </h4>
          <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">
            {new Date(log.createdAt).toLocaleString()}
          </p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${statusBadgeColor}`}>
          {log.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-400 mt-2">
        {log.durationMs && (
          <div>
            <span className="font-medium">{t('aiTrace.duration')}:</span> {log.durationMs}ms
          </div>
        )}
        {log.projectId && (
          <div className="col-span-2">
            <span className="font-medium">{t('aiTrace.projectId')}:</span>{' '}
            {log.projectId.substring(0, 8)}...
          </div>
        )}
      </div>

      {log.errorMessage && (
        <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded text-xs">
          {log.errorMessage}
        </div>
      )}
    </div>
  )
}
