import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePushSetup } from '../hooks/usePushSetup'

const DISMISS_KEY = 'push-onboarding-banner-dismissed'

export default function PushOnboardingBanner() {
  const { t } = useTranslation()
  const { needsPwaInstall, hasSubscription, permission } = usePushSetup()
  const [dismissed, setDismissed] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_KEY) === '1'
  ))

  const needsSetup = needsPwaInstall || (!hasSubscription && permission !== 'granted')

  if (dismissed || !needsSetup) {
    return null
  }

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t('profile.notifications.bannerTitle')}</p>
          <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">{t('profile.notifications.bannerBody')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/profile#notifications"
            className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            {t('profile.notifications.bannerAction')}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-900/40"
            aria-label={t('profile.notifications.bannerDismiss')}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
