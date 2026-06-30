import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { progressPercent } from '../lib/meetingStudio/jobTypes'
import { isMeetingStudioJobResultEmpty } from '../lib/meetingStudio/pendingJobStorage'
import { useMeetingStudioJobStore } from '../stores/meetingStudioJobStore'

export default function MeetingStudioJobBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const status = useMeetingStudioJobStore((state) => state.status)
  const progressKey = useMeetingStudioJobStore((state) => state.progressKey)
  const fileName = useMeetingStudioJobStore((state) => state.fileName)
  const error = useMeetingStudioJobStore((state) => state.error)
  const result = useMeetingStudioJobStore((state) => state.result)
  const dismissed = useMeetingStudioJobStore((state) => state.dismissed)
  const dismissBanner = useMeetingStudioJobStore((state) => state.dismissBanner)
  const hydratePendingJob = useMeetingStudioJobStore((state) => state.hydratePendingJob)

  useEffect(() => {
    hydratePendingJob()
  }, [hydratePendingJob])

  if (dismissed || status === 'idle') {
    return null
  }

  const percent = progressPercent(progressKey)
  const isRunning = status === 'running'
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'
  const isEmptyResult = isCompleted && result ? isMeetingStudioJobResultEmpty(result) : false

  const toneClass = isFailed || isEmptyResult
    ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100'
    : isCompleted
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
      : 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100'

  const barClass = isFailed || isEmptyResult
    ? 'bg-red-500'
    : isCompleted
      ? 'bg-emerald-500'
      : 'bg-blue-500'

  const title = isFailed
    ? t('meetings.backgroundJob.failedTitle')
    : isEmptyResult
      ? t('meetings.backgroundJob.emptyResultTitle')
      : isCompleted
        ? t('meetings.backgroundJob.completedTitle')
        : t('meetings.backgroundJob.runningTitle')

  const description = isFailed
    ? (error || t('meetings.backgroundJob.failedDescription'))
    : isEmptyResult
      ? t('meetings.backgroundJob.emptyResultDescription', { fileName })
      : isCompleted
        ? t('meetings.backgroundJob.completedDescription', { fileName })
        : t('meetings.backgroundJob.runningDescription', {
            step: t(`meetings.progress.steps.${progressKey}`),
            fileName
          })

  return (
    <div className={`fixed inset-x-0 top-0 z-[70] border-b px-4 py-3 shadow-md ${toneClass}`}>
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{title}</p>
            {(isRunning || isCompleted) && (
              <span className="text-xs font-medium">{percent}%</span>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm opacity-90">{description}</p>
          {(isRunning || isCompleted) && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70 dark:bg-slate-900/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barClass} ${isRunning ? 'animate-pulse' : ''}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              to="/meetings"
              onClick={() => navigate('/meetings')}
              className="rounded-md border border-current/20 bg-white/70 px-2.5 py-1 text-xs font-semibold hover:bg-white dark:bg-slate-900/40 dark:hover:bg-slate-900/70"
            >
              {t('meetings.backgroundJob.openMeetingStudio')}
            </Link>
            {isCompleted && !isEmptyResult && (
              <span className="rounded-md px-2.5 py-1 text-xs font-medium opacity-80">
                {t('meetings.backgroundJob.saveRequiredHint')}
              </span>
            )}
            {isCompleted && (
              <span className="rounded-md px-2.5 py-1 text-xs font-medium opacity-80">
                {t('meetings.backgroundJob.safeToNavigate')}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={dismissBanner}
          className="rounded-md border border-current/20 px-2 py-1 text-xs font-semibold hover:bg-white/60 dark:hover:bg-slate-900/50"
        >
          {t('meetings.backgroundJob.dismiss')}
        </button>
      </div>
    </div>
  )
}
