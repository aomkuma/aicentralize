interface WorkflowProgressStep {
  key: string
  label: string
}

export type WorkflowProgressStat = {
  label: string
  value: string
}

interface WorkflowProgressPanelProps {
  title: string
  subtitle?: string
  detail?: string
  percent?: number
  progressLabel?: string
  elapsedLabel?: string
  etaLabel?: string
  subProgress?: {
    label: string
    percent: number
  }
  stats?: WorkflowProgressStat[]
  steps: WorkflowProgressStep[]
  activeKey: string
  failedHint?: string
}

export default function WorkflowProgressPanel({
  title,
  subtitle,
  detail,
  percent,
  progressLabel = 'Progress',
  elapsedLabel,
  etaLabel,
  subProgress,
  stats,
  steps,
  activeKey,
  failedHint,
}: WorkflowProgressPanelProps) {
  const activeIndex = steps.findIndex((step) => step.key === activeKey)
  const safePercent = typeof percent === 'number'
    ? Math.min(100, Math.max(0, Math.round(percent)))
    : null
  const safeSubPercent = subProgress
    ? Math.min(100, Math.max(0, Math.round(subProgress.percent)))
    : null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
        )}
      </div>

      {detail && (
        <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          {detail}
        </p>
      )}

      {(elapsedLabel || etaLabel) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {elapsedLabel && <span>{elapsedLabel}</span>}
          {etaLabel && <span className="font-medium text-blue-700 dark:text-blue-300">{etaLabel}</span>}
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {stat.label}
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {safePercent !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{progressLabel}</span>
            <span>{safePercent}%</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                activeKey === 'failed' ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${safePercent}%` }}
            />
          </div>
        </div>
      )}

      {subProgress && safeSubPercent !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{subProgress.label}</span>
            <span>{safeSubPercent}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${safeSubPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {steps.map((step, index) => {
          const isActive = activeKey === step.key
          const isCompleted = activeIndex > -1 && index < activeIndex
          const isFinalCompleted = step.key === 'completed' && isActive

          return (
            <div
              key={step.key}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                isFinalCompleted || isCompleted
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200'
                  : isActive
                    ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-200'
                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300'
              }`}
            >
              <span className="mt-0.5 font-bold">
                {isFinalCompleted || isCompleted ? '✓' : isActive ? '•' : String(index + 1)}
              </span>
              <span>{step.label}</span>
            </div>
          )
        })}

        {activeKey === 'failed' && failedHint && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
            {failedHint}
          </div>
        )}
      </div>
    </section>
  )
}
