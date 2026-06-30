import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommunicationSentimentSnapshot } from '../types'

type TeamSentimentBadgeProps = {
  snapshot?: CommunicationSentimentSnapshot | null
}

const moodToneClass: Record<CommunicationSentimentSnapshot['moodState'], string> = {
  CALM: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800',
  NEEDS_ATTENTION: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800',
  HIGH_PRESSURE: 'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-900/30 dark:text-orange-100 dark:border-orange-800',
  INSUFFICIENT_DATA: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
}

const moodIcon: Record<CommunicationSentimentSnapshot['moodState'], string> = {
  CALM: '🙂',
  NEEDS_ATTENTION: '👀',
  HIGH_PRESSURE: '⚠️',
  INSUFFICIENT_DATA: '…'
}

export default function TeamSentimentBadge({ snapshot }: TeamSentimentBadgeProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  if (!snapshot) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {moodIcon.INSUFFICIENT_DATA} {t('communicationSentiment.noData')}
      </span>
    )
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${moodToneClass[snapshot.moodState]}`}
        title={t('communicationSentiment.openDetail')}
      >
        <span>{moodIcon[snapshot.moodState]}</span>
        <span>{t(`communicationSentiment.moodState.${snapshot.moodState}`)}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('communicationSentiment.detailTitle')}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('communicationSentiment.windowLabel', {
              start: new Date(snapshot.windowStart).toLocaleDateString(),
              end: new Date(snapshot.windowEnd).toLocaleDateString()
            })}
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{snapshot.summary}</p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800">
              <span className="text-slate-500 dark:text-slate-400">{t('communicationSentiment.sampleCount')}</span>
              <p className="font-semibold text-slate-900 dark:text-white">{snapshot.sampleCount}</p>
            </div>
            <div className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800">
              <span className="text-slate-500 dark:text-slate-400">{t('communicationSentiment.toneTrend')}</span>
              <p className="font-semibold text-slate-900 dark:text-white">{snapshot.moodScore}</p>
            </div>
          </div>

          {snapshot.signals.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('communicationSentiment.signals')}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                {snapshot.signals.slice(0, 4).map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>
          )}

          {snapshot.suggestions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('communicationSentiment.suggestions')}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                {snapshot.suggestions.slice(0, 3).map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {snapshot.caveats.length > 0 && (
            <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              {snapshot.caveats[0]}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
