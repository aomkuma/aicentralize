import { useTranslation } from 'react-i18next'
import { redactAiMetadata } from '../../../lib/redactAiMetadata'
import type { AiRunLog } from '../../../types'

interface AiTraceDetailProps {
  log: AiRunLog | null
}

export default function AiTraceDetail({ log }: AiTraceDetailProps) {
  const { t } = useTranslation()

  if (!log) {
    return (
      <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-lg">
        <p className="text-gray-500 dark:text-slate-400">
          {t('aiTrace.selectLog')}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-6 space-y-6">
      {/* Header */}
      <div className="pb-6 border-b border-gray-200 dark:border-slate-600">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {t(`aiTrace.operations.${log.operation.toLowerCase()}`)}
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              log.status === 'SUCCESS'
                ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
            }`}
          >
            {log.status}
          </span>
          <span className="text-gray-600 dark:text-slate-400">
            {new Date(log.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Metadata */}
      <div>
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
          {t('aiTrace.metadata')}
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {log.promptVersion && (
            <div>
              <span className="text-gray-600 dark:text-slate-400">
                {t('aiTrace.promptVersion')}:
              </span>
              <p className="font-medium text-gray-900 dark:text-white">
                {log.promptVersion}
              </p>
            </div>
          )}
          {log.durationMs && (
            <div>
              <span className="text-gray-600 dark:text-slate-400">
                {t('aiTrace.duration')}:
              </span>
              <p className="font-medium text-gray-900 dark:text-white">
                {log.durationMs}ms
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Retrieved Documents */}
      {log.retrievedIds && log.retrievedIds.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
            {t('aiTrace.retrievedDocuments')}
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {log.retrievedIds.map((id, idx) => (
              <div
                key={idx}
                className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800"
              >
                <p className="text-xs font-mono text-gray-600 dark:text-slate-400 break-all">
                  {id}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trace Information */}
      {log.trace && (
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
            {t('aiTrace.traceInformation')}
          </h4>
          <div className="bg-gray-50 dark:bg-slate-800 rounded p-4 overflow-auto max-h-48">
            <pre className="text-xs text-gray-600 dark:text-slate-400 font-mono">
              {JSON.stringify(redactAiMetadata(log.trace), null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Error Message */}
      {log.errorMessage && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
          <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">
            {t('aiTrace.error')}
          </h4>
          <p className="text-sm text-red-700 dark:text-red-400">{log.errorMessage}</p>
        </div>
      )}
    </div>
  )
}
