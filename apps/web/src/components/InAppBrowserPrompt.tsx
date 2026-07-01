import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, X } from 'lucide-react'
import {
  detectInAppBrowser,
  IN_APP_BROWSER_DISMISS_KEY,
  type InAppBrowserDetection,
} from '../lib/inAppBrowser'

export default function InAppBrowserPrompt() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [detection, setDetection] = useState<InAppBrowserDetection | null>(null)

  useEffect(() => {
    const result = detectInAppBrowser()
    if (!result.isInApp) {
      return
    }

    if (sessionStorage.getItem(IN_APP_BROWSER_DISMISS_KEY) === '1') {
      return
    }

    setDetection(result)
    setVisible(true)
  }, [])

  const appName = useMemo(() => {
    if (!detection?.kind) {
      return t('landing.inAppBrowser.apps.generic')
    }

    return t(`landing.inAppBrowser.apps.${detection.kind}`)
  }, [detection?.kind, t])

  const browserName = detection?.isIos
    ? t('landing.inAppBrowser.browsers.safari')
    : t('landing.inAppBrowser.browsers.default')

  const steps = detection?.isIos
    ? t('landing.inAppBrowser.iosSteps', { browser: browserName })
    : t('landing.inAppBrowser.androidSteps', { browser: browserName })

  const copyCurrentLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const dismiss = () => {
    sessionStorage.setItem(IN_APP_BROWSER_DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible || !detection) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="in-app-browser-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 text-white shadow-2xl shadow-black/50 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500/15 text-cyan-300">
              <ExternalLink className="h-5 w-5" />
            </span>
            <div>
              <h2 id="in-app-browser-title" className="text-lg font-bold">
                {t('landing.inAppBrowser.title')}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {t('landing.inAppBrowser.message', { appName, browser: browserName })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t('landing.inAppBrowser.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm leading-relaxed text-cyan-50">
          {steps}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void copyCurrentLink()}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-blue-500 hover:to-cyan-400"
          >
            {copied ? t('landing.inAppBrowser.copied') : t('landing.inAppBrowser.copyLink')}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            {t('landing.inAppBrowser.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
