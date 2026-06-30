import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePWAInstall, usePWAStatus } from '../hooks/usePWA'

export default function PWAInstallPrompt() {
  const { t } = useTranslation()
  const { isInstallable, install } = usePWAInstall()
  const { isPWAInstalled } = usePWAStatus()
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    setShowPrompt(isInstallable && !isPWAInstalled)
  }, [isInstallable, isPWAInstalled])

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg shadow-lg p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-sm mb-1">{t('common.installPromptTitle', { appName: t('common.appName') })}</h3>
            <p className="text-xs text-blue-100">
              Get quick access from your home screen. Install our app to stay productive on the go.
            </p>
          </div>
          <button
            onClick={() => setShowPrompt(false)}
            className="text-blue-100 hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              install()
              setShowPrompt(false)
            }}
            className="flex-1 px-3 py-2 bg-white text-blue-600 font-semibold rounded text-xs hover:bg-blue-50 transition-colors"
          >
            Install
          </button>
          <button
            onClick={() => setShowPrompt(false)}
            className="flex-1 px-3 py-2 bg-blue-500 text-white rounded text-xs hover:bg-blue-700 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
