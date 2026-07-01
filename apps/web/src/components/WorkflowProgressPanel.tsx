interface WorkflowProgressStep {
  key: string
  label: string
}

interface WorkflowProgressPanelProps {
  title: string
  subtitle?: string
  detail?: string
  steps: WorkflowProgressStep[]
  activeKey: string
  failedHint?: string
}

export default function WorkflowProgressPanel({
  title,
  subtitle,
  detail,
  steps,
  activeKey,
  failedHint,
}: WorkflowProgressPanelProps) {
  const activeIndex = steps.findIndex((step) => step.key === activeKey)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
        )}
      </div>

      {detail && (
        <p className="mt-2 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
          {detail}
        </p>
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
