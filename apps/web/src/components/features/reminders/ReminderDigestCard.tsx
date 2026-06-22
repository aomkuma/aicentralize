import { useTranslation } from 'react-i18next'
import type { ReminderDigest } from '../../../types'

interface ReminderDigestCardProps {
  digest: ReminderDigest
  onClick?: () => void
  isActive?: boolean
}

export default function ReminderDigestCard({
  digest,
  onClick,
  isActive = false,
}: ReminderDigestCardProps) {
  const { t } = useTranslation()

  const escalationPercentage =
    digest.totalEscalated > 0
      ? Math.round((digest.totalEscalated / digest.totalOverdue) * 100)
      : 0

  return (
    <div
      onClick={onClick}
      className={`p-4 bg-white dark:bg-slate-700 rounded-lg border-2 cursor-pointer transition-all ${
        isActive
          ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900'
          : 'border-gray-200 dark:border-slate-600 hover:shadow-md'
      }`}
    >
      <div className="mb-3">
        <div className="text-sm text-gray-600 dark:text-slate-400 mb-1">
          {new Date(digest.windowStart).toLocaleDateString()} -{' '}
          {new Date(digest.windowEnd).toLocaleDateString()}
        </div>
        <div className="text-xs text-gray-500 dark:text-slate-500">
          {t('reminders.digestCreated')}:{' '}
          {new Date(digest.createdAt).toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-slate-400 mb-1">
            {t('reminders.open')}
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white">
            {digest.totalOpen}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-slate-400 mb-1">
            {t('reminders.dueSoon')}
          </div>
          <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
            {digest.totalDueSoon}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-slate-400 mb-1">
            {t('reminders.overdue')}
          </div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400">
            {digest.totalOverdue}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 dark:text-slate-400 mb-1">
            {t('reminders.escalated')}
          </div>
          <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {digest.totalEscalated}
          </div>
        </div>
      </div>

      {digest.totalOverdue > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600">
          <div className="text-xs text-gray-600 dark:text-slate-400">
            {t('reminders.escalationRate')}: {escalationPercentage}%
          </div>
          <div className="mt-1 h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${escalationPercentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
