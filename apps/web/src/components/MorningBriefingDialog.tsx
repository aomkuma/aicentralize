import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import type { MorningBriefing, MorningBriefingAckMood } from '../types'

type MorningBriefingDialogProps = {
  tenantId?: string
}

type LatestResponse = {
  briefing: MorningBriefing | null
}

type AckResponse = {
  acknowledgement: NonNullable<MorningBriefing['acknowledgement']>
}

const acknowledgeOptions: Array<{
  mood: MorningBriefingAckMood
  label: string
  score: number
  className: string
}> = [
  {
    mood: 'GOT_IT',
    label: 'I got it!',
    score: 3,
    className: 'border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700',
  },
  {
    mood: 'I_KNOW',
    label: 'I know',
    score: 0,
    className: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  },
  {
    mood: 'RUDENESS',
    label: 'เออ รู้แล้ว',
    score: -3,
    className: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  },
]

export default function MorningBriefingDialog({ tenantId }: MorningBriefingDialogProps) {
  const { get, post, isLoading } = useApi()
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [showReviewConfirm, setShowReviewConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) {
      setBriefing(null)
      setIsVisible(false)
      return
    }

    const loadBriefing = async () => {
      const params = new URLSearchParams({ tenantId })
      const data = await get<LatestResponse>(`/morning-briefings/me/latest?${params.toString()}`)
      const nextBriefing = data?.briefing ?? null
      setBriefing(nextBriefing)
      setIsVisible(Boolean(nextBriefing && !nextBriefing.acknowledgement))
    }

    void loadBriefing()
  }, [tenantId, get])

  const acknowledge = async (mood: MorningBriefingAckMood, reviewAgain?: boolean) => {
    if (!briefing) return

    setError(null)
    const response = await post<AckResponse>(`/morning-briefings/${briefing.id}/acknowledge`, {
      mood,
      reviewAgain,
    })

    if (!response?.acknowledgement) {
      setError('Unable to acknowledge this briefing. Please try again.')
      return
    }

    setBriefing({ ...briefing, acknowledgement: response.acknowledgement })
    setShowReviewConfirm(false)
    setIsVisible(false)
  }

  const handleAcknowledge = (mood: MorningBriefingAckMood) => {
    if (mood === 'RUDENESS') {
      setShowReviewConfirm(true)
      return
    }
    void acknowledge(mood)
  }

  if (!briefing || !isVisible) {
    return null
  }

  const evidenceById = new Map(briefing.evidence.map((item) => [item.actionItemId, item]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="morning-briefing-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Rubjob morning briefing
          </p>
          <h2 id="morning-briefing-title" className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
            {briefing.headline}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {briefing.summary}
          </p>
        </div>

        <div className="space-y-5 px-5 py-5">
          {briefing.sections.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{section.title}</h3>
              <ul className="mt-2 space-y-2">
                {section.items.map((item, index) => (
                  <li
                    key={`${section.title}-${index}`}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {briefing.evidence.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Evidence</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {briefing.actionItemIds.slice(0, 6).map((id) => {
                  const item = evidenceById.get(id)
                  if (!item) return null
                  return (
                    <Link
                      key={id}
                      to={`/action-items/${id}`}
                      className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
                    >
                      <span className="block font-semibold text-slate-900 dark:text-white">{item.task}</span>
                      <span className="mt-1 block">{item.projectName} · {item.priority} · {new Date(item.dueDate).toLocaleDateString()}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="grid gap-2 sm:grid-cols-3">
            {acknowledgeOptions.map((option) => (
              <button
                key={option.mood}
                type="button"
                disabled={isLoading}
                onClick={() => handleAcknowledge(option.mood)}
                className={`rounded-md border px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${option.className}`}
              >
                {option.label}
                <span className="ml-2 text-xs opacity-80">{option.score > 0 ? `+${option.score}` : option.score}</span>
              </button>
            ))}
          </div>
        </div>

        {showReviewConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 px-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <h3 className="text-lg font-bold text-slate-950 dark:text-white">ตรวจสอบบรีฟอีกครั้งไหม?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                ต้องการตรวจสอบงานที่แสดงในบรีฟอีกครั้งหรือไม่
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowReviewConfirm(false)}
                  className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
                >
                  Yes
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void acknowledge('RUDENESS', false)}
                  className="rounded-md border border-rose-200 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
